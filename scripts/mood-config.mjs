import { CONST } from './config.mjs';
import { canonicalizeId, log } from './helpers.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const AVAILABLE_ICONS = [
  { value: 'fas fa-music', label: '🎵 Music Note' },
  { value: 'fas fa-leaf', label: '🌿 Leaf (Calm)' },
  { value: 'fas fa-exclamation-triangle', label: '⚠️ Warning (Tense)' },
  { value: 'fas fa-skull', label: '💀 Skull (Boss)' },
  { value: 'fas fa-user-ninja', label: '🥷 Ninja (Stealth)' },
  { value: 'fas fa-trophy', label: '🏆 Trophy (Victory)' },
  { value: 'fas fa-fist-raised', label: '✊ Fist (Combat)' },
  { value: 'fas fa-fire', label: '🔥 Fire (Action)' },
  { value: 'fas fa-ghost', label: '👻 Ghost (Horror)' },
  { value: 'fas fa-bolt', label: '⚡ Bolt (Energy)' },
  { value: 'fas fa-dungeon', label: '🏰 Dungeon (Exploration)' },
  { value: 'fas fa-glass-cheers', label: '🍻 Tavern (Festive)' },
  { value: 'fas fa-magic', label: '🪄 Magic (Arcane)' },
  { value: 'fas fa-shield-alt', label: '🛡️ Shield (Defense)' },
  { value: 'fas fa-feather', label: '🪶 Feather (Ambient)' },
  { value: 'fas fa-water', label: '🌊 Water (Ocean)' },
  { value: 'fas fa-mask', label: '🎭 Mask (Intrigue)' }
];

/**
 * Mood configuration application for managing world moods
 */
export class MoodConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'vgmusic-mood-config',
    tag: 'form',
    window: { title: 'VGMusic.MoodConfig.Title', icon: 'fas fa-sliders-h', resizable: true, minimizable: true },
    modal: true,
    classes: ['vgmusic-mood-config'],
    form: {
      handler: MoodConfigApp.formHandler,
      closeOnSubmit: false,
      submitOnChange: false
    },
    position: { width: 480, height: 'auto' },
    actions: {
      addMood: MoodConfigApp.handleAddMood,
      deleteMood: MoodConfigApp.handleDeleteMood,
      resetDefaults: MoodConfigApp.handleResetDefaults
    }
  };

  /** @override */
  static PARTS = { form: { template: 'modules/vgmusic/templates/mood-config.hbs' } };

  constructor(options = {}) {
    super(options);
    this.moods = foundry.utils.deepClone(game.settings.get(CONST.moduleId, CONST.settings.configuredMoods) || CONST.defaultMoods);
  }

  /** @override */
  _prepareContext(_options) {
    const formattedMoods = this.moods.map((m) => {
      let iconOptions = AVAILABLE_ICONS.map((opt) => ({
        ...opt,
        selected: opt.value === m.icon
      }));

      // Preserve custom icons not in the default list
      if (m.icon && !AVAILABLE_ICONS.some((opt) => opt.value === m.icon)) {
        iconOptions.unshift({ value: m.icon, label: `✨ Custom (${m.icon})`, selected: true });
      }

      return {
        ...m,
        displayLabel: m.label?.startsWith('VGMusic.') ? game.i18n.localize(m.label) : m.label,
        iconOptions
      };
    });

    const buttons = [
      { type: 'submit', icon: 'fas fa-save', label: 'VGMusic.UI.Save' }
    ];
    return { moods: formattedMoods, buttons };
  }

  /**
   * Handle adding a new mood entry
   */
  static handleAddMood(event, target) {
    event.preventDefault();
    this.moods.push({
      id: '',
      label: 'New Mood',
      icon: 'fas fa-music',
      color: '#3b82f6'
    });
    this.render(false);
  }

  /**
   * Handle deleting a mood entry
   */
  static handleDeleteMood(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index);
    if (!isNaN(index) && index >= 0 && index < this.moods.length) {
      const [removed] = this.moods.splice(index, 1);
      // Saving without this mood leaves any scene/token/global overrides that reference
      // its id in place but unreachable; warn rather than silently sweep world documents.
      if (removed?.id) {
        const label = removed.label?.startsWith('VGMusic.') ? game.i18n.localize(removed.label) : removed.label;
        ui.notifications?.warn(`${game.i18n.localize('VGMusic.MoodConfig.DeleteOrphanWarning')}: ${label || removed.id}`);
      }
      this.render(false);
    }
  }

  /**
   * Handle resetting moods to default
   */
  static handleResetDefaults(event, target) {
    event.preventDefault();
    this.moods = foundry.utils.deepClone(CONST.defaultMoods);
    this.render(false);
  }

  /**
   * Handle form submission
   */
  static async formHandler(event, form, formData) {
    const expanded = foundry.utils.expandObject(formData.object);
    const rawMoods = expanded.moods ? Object.values(expanded.moods) : [];

    const seenIds = new Set();
    const cleanedMoods = rawMoods.map((m) => {
      const label = (m.label || '').trim();
      // Preserve an existing row's id across renames so scene/token/global overrides
      // keyed by that id keep resolving; only mint a fresh id for newly-added rows.
      const existingId = (m.id || '').trim();
      const baseId = existingId || canonicalizeId(label) || `mood-${Date.now()}`;
      let uniqueId = baseId;
      let suffix = 2;
      while (seenIds.has(uniqueId)) {
        uniqueId = `${baseId}-${suffix}`;
        suffix++;
      }
      seenIds.add(uniqueId);
      return {
        id: uniqueId,
        label: label,
        icon: m.icon || 'fas fa-music',
        color: m.color || '#3b82f6'
      };
    }).filter((m) => m.label.length > 0);

    try {
      await game.settings.set(CONST.moduleId, CONST.settings.configuredMoods, cleanedMoods);
      log(3, 'Successfully saved configured moods:', cleanedMoods);
      this.close();
    } catch (error) {
      log(1, 'Failed to save configured moods:', error);
      ui.notifications.error('Failed to save mood configuration');
    }
  }
}
