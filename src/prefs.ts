import Gtk from "gi://Gtk";
import Adw from "gi://Adw";
import Gio from "gi://Gio";
import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class GnomeRectanglePreferences extends ExtensionPreferences {
  _settings?: Gio.Settings;

  fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    this._settings = this.getSettings();

    const page = new Adw.PreferencesPage({
      title: _("General"),
      iconName: "dialog-information-symbolic",
    });

    const behaviorGroup = new Adw.PreferencesGroup({
      title: _("Behavior"),
      description: _("Configure behavior"),
    });
    page.add(behaviorGroup);

    const timeoutRow = new Adw.SpinRow({
      title: _("Restart timeout"),
      subtitle: _("seconds"),
      adjustment: new Gtk.Adjustment({
        upper: 300,
        lower: 0,
        step_increment: 1,
      }),
    });
    this._settings.bind(
      "timeout",
      timeoutRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    behaviorGroup.add(timeoutRow);

    window.add(page);

    return Promise.resolve();
  }
}
