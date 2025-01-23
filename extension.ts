import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Dialog from "resource:///org/gnome/shell/ui/dialog.js";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";

class BootEntry {
  id: string;
  title: string;
  isSelected: boolean;

  constructor(id: string, title: string, isSelected: boolean) {
    this.id = id;
    this.title = title;
    this.isSelected = isSelected;
  }
}

Gio._promisify(Gio.Subprocess.prototype, "communicate_async");
Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async");
Gio._promisify(Gio.Subprocess.prototype, "wait_async");
Gio._promisify(Gio.Subprocess.prototype, "wait_check_async");

export default class MyExtension extends Extension {
  gsettings?: Gio.Settings;
  animationsEnabled: boolean = true;
  menuItem?: PopupMenu.PopupSubMenuMenuItem;
  selected?: BootEntry;
  timer?: GLib.Source;
  TIMEOUT: number = 60;

  private async getBootEntries(): Promise<BootEntry[]> {
    const proc = Gio.Subprocess.new(
      ["bootctl", "list", "--json=short"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    );
    const [stdout, stderr] = await proc.communicate_utf8_async(null, null);

    if (!proc.get_successful()) {
      throw new Error(stderr);
    }

    return JSON.parse(stdout);
  }

  private addMenuItem() {
    this.getBootEntries()
      .then((bootEntries) => {
        bootEntries.forEach((entry) => {
          if (entry.isSelected) {
            return;
          }

          this.menuItem?.menu.addAction(entry.title, () => {
            this.selected = entry;
            this.showConfirmation();
            this.timer = setTimeout(() => {
              this.reboot();
            }, this.TIMEOUT * 1000);
          });
        });
        Main.panel.statusArea.quickSettings._system?.quickSettingsItems[0].menu.addMenuItem(
          this.menuItem,
          2,
        );
      })
      .catch((err) => {
        console.debug(err);
        return;
      });
  }

  private showConfirmation() {
    if (!this.selected) {
      return;
    }
    const dialog = new ModalDialog.ModalDialog({});
    const messageLayout = new Dialog.MessageDialogContent({
      title: `Restart To ${this.selected.title}`,
      description: `The system will restart automatically in ${this.TIMEOUT} seconds`,
    });
    dialog.contentLayout.add_child(messageLayout);

    dialog.setButtons([
      {
        label: this.gettext("Cancel"),
        action: () => {
          this.clearTimers();
          dialog.close();
        },
        key: Clutter.KEY_Escape,
        default: true,
      },
      {
        label: this.gettext("Restart"),
        action: () => {
          this.clearTimers();
          this.reboot();
        },
        default: false,
      },
    ]);

    dialog.open();
  }
  private clearTimers() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private async reboot() {
    if (!this.selected) {
      return;
    }
    const proc = Gio.Subprocess.new(
      [
        "systemctl",
        "reboot",
        "--boot-loader-menu=1",
        `--boot-loader-entry=${this.selected.id}`,
      ],
      Gio.SubprocessFlags.NONE,
    );
    await proc.wait_async();
    if (!proc.get_successful()) {
      throw new Error(`Failed rebooting to ${this.selected.title}`);
    }
  }

  enable() {
    this.gsettings = this.getSettings();
    this.animationsEnabled =
      this.gsettings!.get_value("timeout").deepUnpack() ?? 60;

    this.menuItem = new PopupMenu.PopupSubMenuMenuItem(
      this.gettext("Restart To..."),
      false,
    );
    GLib.idle_add(
      GLib.PRIORITY_DEFAULT,
      () => {
        if (!Main.panel.statusArea.quickSettings._system) {
          return GLib.SOURCE_CONTINUE;
        }
        this.addMenuItem();
        return GLib.SOURCE_REMOVE;
      },
      null,
    );
  }

  disable() {
    this.gsettings = undefined;
    this.menuItem?.destroy();
    this.menuItem = undefined;
  }
}
