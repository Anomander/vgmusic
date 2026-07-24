import { MoodConfigApp } from './mood-config.mjs';
import { MoodWidget } from './mood-widget.mjs';
import { PlaylistTreeApp } from './playlist-tree.mjs';
import { CONST } from './config.mjs';
import { log } from './helpers.mjs';

/**
 * Register module settings and configuration menu
 */
export function registerSettings() {
  game.settings.registerMenu(CONST.moduleId, 'playlistTreeMenu', {
    name: 'VGMusic.PlaylistTree.Name',
    label: 'VGMusic.PlaylistTree.Label',
    hint: 'VGMusic.PlaylistTree.Hint',
    icon: 'fas fa-sitemap',
    type: PlaylistTreeApp,
    restricted: true
  });

  game.settings.registerMenu(CONST.moduleId, 'moodConfigMenu', {
    name: 'VGMusic.Settings.MoodConfig.Name',
    label: 'VGMusic.Settings.MoodConfig.Label',
    hint: 'VGMusic.Settings.MoodConfig.Hint',
    icon: 'fas fa-sliders-h',
    type: MoodConfigApp,
    restricted: true
  });

  game.settings.register(CONST.moduleId, CONST.settings.defaultMusic, {
    scope: 'world',
    config: false,
    type: Object,
    default: { documentName: 'DefaultMusic', data: { vgmusic: { music: {} } } }
  });

  game.settings.register(CONST.moduleId, CONST.settings.activeMood, {
    name: 'VGMusic.Settings.ActiveMood.Name',
    scope: 'world',
    config: false,
    type: String,
    default: '',
    onChange: (newMood) => {
      game.vgmusic?.musicController?.playCurrentTrack();

      const refreshApp = (app) => {
        if (!app || !app.rendered) return;
        const name = app.constructor?.name;
        if (name === 'MoodWidget' || name === 'PlaylistTreeApp') {
          app.render(false);
        } else if (name === 'VGMusicConfig') {
          app.selectedMood = newMood || '';
          app.render(false);
        }
      };

      if (typeof ui !== 'undefined' && ui.windows) {
        for (const app of Object.values(ui.windows)) refreshApp(app);
      }
      if (foundry?.applications?.instances) {
        for (const app of foundry.applications.instances.values()) refreshApp(app);
      }
    }
  });

  game.settings.register(CONST.moduleId, CONST.settings.configuredMoods, {
    name: 'VGMusic.Settings.ConfiguredMoods.Name',
    scope: 'world',
    config: false,
    type: Array,
    default: CONST.defaultMoods,
    onChange: () => {
      const refreshApp = (app) => {
        if (app && app.rendered && ['MoodWidget', 'PlaylistTreeApp', 'VGMusicConfig'].includes(app.constructor?.name)) {
          app.render(false);
        }
      };

      if (typeof ui !== 'undefined' && ui.windows) {
        for (const app of Object.values(ui.windows)) refreshApp(app);
      }
      if (foundry?.applications?.instances) {
        for (const app of foundry.applications.instances.values()) refreshApp(app);
      }
    }
  });

  game.settings.register(CONST.moduleId, CONST.settings.moodWidgetPosition, {
    scope: 'client',
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(CONST.moduleId, CONST.settings.fadeDuration, {
    name: 'VGMusic.Settings.FadeDuration.Name',
    hint: 'VGMusic.Settings.FadeDuration.Hint',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0, max: 10, step: 0.5 },
    default: 0
  });

  game.settings.register(CONST.moduleId, CONST.settings.suppressArea, {
    name: 'VGMusic.Settings.SuppressArea.Name',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    onChange: () => {
      game.vgmusic?.musicController?.playCurrentTrack();
    }
  });

  game.settings.register(CONST.moduleId, CONST.settings.suppressCombat, {
    name: 'VGMusic.Settings.SuppressCombat.Name',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    onChange: () => {
      game.vgmusic?.musicController?.playCurrentTrack();
    }
  });

  game.settings.register(CONST.moduleId, 'enableDebug', {
    name: 'VGMusic.Settings.EnableDebug.Name',
    hint: 'VGMusic.Settings.EnableDebug.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });
}

/**
 * Register keybindings
 */
export function registerKeybindings() {
  // All four actions either mutate world-scoped settings or open GM-only management
  // apps, so every binding is restricted - a player pressing one should see nothing
  // happen, not a swallowed permission error.
  game.keybindings.register(CONST.moduleId, 'toggleAreaMusic', {
    name: 'VGMusic.Keybindings.ToggleAreaMusic',
    restricted: true,
    onDown: () => toggleAreaMusic()
  });

  game.keybindings.register(CONST.moduleId, 'toggleCombatMusic', {
    name: 'VGMusic.Keybindings.ToggleCombatMusic',
    restricted: true,
    onDown: () => toggleCombatMusic()
  });

  game.keybindings.register(CONST.moduleId, 'toggleMoodWidget', {
    name: 'VGMusic.Keybindings.ToggleMoodWidget',
    restricted: true,
    onDown: () => MoodWidget.toggle()
  });

  game.keybindings.register(CONST.moduleId, 'togglePlaylistTree', {
    name: 'VGMusic.Keybindings.TogglePlaylistTree',
    restricted: true,
    onDown: () => PlaylistTreeApp.toggle()
  });
}

/**
 * Toggle area music suppression
 */
async function toggleAreaMusic() {
  const current = game.settings.get(CONST.moduleId, CONST.settings.suppressArea);
  const target = !current;
  try {
    await game.settings.set(CONST.moduleId, CONST.settings.suppressArea, target);
    log(3, `Successfully toggled area music suppression to: ${target}`);
  } catch (error) {
    log(1, `Failed to toggle area music suppression to ${target}:`, error);
  }
  ui.controls.initialize();
}

/**
 * Toggle combat music suppression
 */
async function toggleCombatMusic() {
  const current = game.settings.get(CONST.moduleId, CONST.settings.suppressCombat);
  const target = !current;
  try {
    await game.settings.set(CONST.moduleId, CONST.settings.suppressCombat, target);
    log(3, `Successfully toggled combat music suppression to: ${target}`);
  } catch (error) {
    log(1, `Failed to toggle combat music suppression to ${target}:`, error);
  }
  ui.controls.initialize();
}
