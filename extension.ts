import GLib from "gi://GLib";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

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
            this.restartTo(entry);
          });
        });
        Main.panel.statusArea.quickSettings._system?.quickSettingsItems[0].menu.addMenuItem(
          this.menuItem,
          2,
        );
      })
      .catch((err) => {
        log(err);
        return;
      });
  }

  private async restartTo(entry: BootEntry) {
    const proc = Gio.Subprocess.new(
      [
        "systemctl",
        "reboot",
        "--boot-loader-menu=1",
        `--boot-loader-entry=${entry.id}`,
      ],
      Gio.SubprocessFlags.NONE,
    );
    await proc.wait_async();
    if (!proc.get_successful()) {
      throw new Error(`Failed rebooting to ${entry.title}`);
    }
  }

  enable() {
    this.gsettings = this.getSettings();
    this.menuItem = new PopupMenu.PopupSubMenuMenuItem(
      this.gettext("Restart To..."),
      false,
    );
    if (Main.panel.statusArea.quickSettings._system) {
      this.addMenuItem();
    } else {
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
  }

  disable() {
    this.gsettings = undefined;
    this.menuItem?.destroy();
  }
}
