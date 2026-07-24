import { registerSettings, registerKeybindings } from './settings.mjs';
import { MusicController } from './music-controller.mjs';
import { MoodWidget } from './mood-widget.mjs';
import { MoodConfigApp } from './mood-config.mjs';
import { log } from './helpers.mjs';
import { VGMusicConfig } from './app.mjs';
import {
  getSceneControlButtons,
  handleCanvasReady,
  handleCreateCombatant,
  handleDeleteCombat,
  handleDeleteCombatant,
  handleReady,
  handleSceneConfigRender,
  handleTokenConfigRender,
  handleUpdateActor,
  handleUpdateCombat,
  handleUpdateCombatant,
  handleUpdateScene,
  handleUpdateToken,
  handleUserConnected
} from './hooks.mjs';

Hooks.once('init', async () => {
  log(3, 'Initializing Video Game Music module');
  game.vgmusic = {
    musicController: new MusicController(),
    VGMusicConfig,
    MoodWidget,
    MoodConfigApp,
    moodWidget: null
  };
  registerSettings();
  registerKeybindings();

  await loadTemplates([
    'modules/vgmusic/templates/music-config.hbs',
    'modules/vgmusic/templates/mood-widget.hbs',
    'modules/vgmusic/templates/mood-config.hbs'
  ]);
});
Hooks.once('ready', handleReady);
Hooks.on('getSceneControlButtons', getSceneControlButtons);
Hooks.on('renderSceneConfig', handleSceneConfigRender);
Hooks.on('updateCombat', handleUpdateCombat);
Hooks.on('deleteCombat', handleDeleteCombat);
Hooks.on('canvasReady', handleCanvasReady);
Hooks.on('updateScene', handleUpdateScene);
Hooks.on('updateActor', handleUpdateActor);
Hooks.on('updateToken', handleUpdateToken);
Hooks.on('createCombatant', handleCreateCombatant);
Hooks.on('deleteCombatant', handleDeleteCombatant);
Hooks.on('updateCombatant', handleUpdateCombatant);
Hooks.on('renderTokenApplication', handleTokenConfigRender);
Hooks.on('userConnected', handleUserConnected);
