import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension, gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Dialog from "resource:///org/gnome/shell/ui/dialog.js";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";

interface BootEntry {
  id: string;
  title: string;
  isSelected: boolean;
}

Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async");
Gio._promisify(Gio.Subprocess.prototype, "wait_check_async");

export default class MyExtension extends Extension {
  private settings?: Gio.Settings;
  private bootMenu?: PopupMenu.PopupSubMenuMenuItem;
  private selectedEntry?: BootEntry;
  private rebootTimer?: GLib.Source;
  private defaultTimeout: number = 60;
  private cancellable?: Gio.Cancellable;
  private activeDialog?: ModalDialog.ModalDialog;

  private async fetchBootEntries(): Promise<BootEntry[]> {
    const command = ["bootctl", "list", "--json=short"];
    const flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;

    const process = Gio.Subprocess.new(command, flags);
    const [stdout, stderr] = await process.communicate_utf8_async(null, null);

    if (this.cancellable?.is_cancelled()) return [];

    if (!process.get_successful()) {
      throw new Error(stderr);
    }

    return JSON.parse(stdout);
  }

  private async populateBootMenu() {
    try {
      const entries = await this.fetchBootEntries();
      if (this.cancellable?.is_cancelled()) return;

      const notSelectedEntries = entries.filter((entry) => !entry.isSelected);
      for (const entry of notSelectedEntries) {
        this.bootMenu?.menu.addAction(entry.title, () => {
          this.selectedEntry = entry;
          this.handleEntrySelection();
        });
      }
      this.addToQuickSettings();
    } catch (error) {
      console.debug(error);
    }
  }

  private addToQuickSettings() {
    const systemMenu = Main.panel.statusArea.quickSettings._system;
    if (!systemMenu) return;

    const position = 2;
    systemMenu.quickSettingsItems[0].menu.addMenuItem(this.bootMenu, position);
  }

  private async handleEntrySelection() {
    if (!this.selectedEntry || this.cancellable?.is_cancelled()) return;

    const timeout: number =
      this.settings?.get_value("timeout").deepUnpack() ?? this.defaultTimeout;

    if (timeout === 0) {
      await this.initiateReboot();
      return;
    }

    this.startRebootTimer(timeout);

    this.createConfirmationDialog(timeout);
    this.activeDialog?.open();
  }

  private createConfirmationDialog(timeout: number) {
    this.activeDialog = new ModalDialog.ModalDialog({});

    this.activeDialog.contentLayout.add_child(
      new Dialog.MessageDialogContent({
        title: _("Restart To %s").format(this.selectedEntry?.title),
        description: _("The system will restart automatically in %d seconds").format(timeout),
      }),
    );

    this.activeDialog.setButtons([
      {
        label: _("Cancel"),
        action: () => {
          this.clearTimers();
          this.activeDialog?.close();
          this.activeDialog = undefined;
        },
        key: Clutter.KEY_Escape,
        default: false,
      },
      {
        label: _("Restart"),
        action: () => {
          this.clearTimers();
          this.initiateReboot();
          this.activeDialog?.close();
          this.activeDialog = undefined;
        },
        default: false,
      },
    ]);
  }

  private startRebootTimer(timeout: number) {
    this.clearTimers();
    this.rebootTimer = setTimeout(() => {
      if (this.activeDialog) {
        this.activeDialog.close();
        this.activeDialog = undefined;
      }
      this.initiateReboot();
    }, timeout * 1000);
  }

  private clearTimers() {
    if (this.rebootTimer) {
      clearTimeout(this.rebootTimer);
      this.rebootTimer = undefined;
    }
  }

  private async initiateReboot() {
    if (!this.selectedEntry || this.cancellable?.is_cancelled()) return;

    const command = ["systemctl", "reboot", `--boot-loader-entry=${this.selectedEntry.id}`];
    const flags = Gio.SubprocessFlags.NONE;

    try {
      const process = Gio.Subprocess.new(command, flags);
      await process.wait_check_async();
    } catch (error) {
      console.debug(error);
    }
  }

  enable() {
    this.settings = this.getSettings();
    this.bootMenu = new PopupMenu.PopupSubMenuMenuItem(_("Restart To..."), false);
    this.cancellable = new Gio.Cancellable();

    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      if (Main.panel.statusArea.quickSettings._system) {
        this.populateBootMenu();
        return GLib.SOURCE_REMOVE;
      }
      return GLib.SOURCE_CONTINUE;
    });
  }

  disable() {
    this.clearTimers();
    this.cancellable?.cancel();

    this.settings = undefined;
    this.bootMenu?.destroy();
    this.bootMenu = undefined;
    this.selectedEntry = undefined;
    if (this.activeDialog) {
      this.activeDialog.close();
      this.activeDialog = undefined;
    }
    this.cancellable = undefined;
  }
}
