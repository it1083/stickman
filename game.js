/**
 * game.js — 微信小游戏入口
 * 加载顺序即依赖顺序，请勿调整。
 */
require('./js/adapter.js');
require('./js/config.js');
require('./js/storage.js');
require('./js/audio.js');
require('./js/skeleton.js');
require('./js/effects.js');
require('./js/ui.js');
require('./js/background.js');
require('./js/fighter.js');
require('./js/ai.js');
require('./js/input.js');
require('./js/adManager.js');
require('./js/scenes.js');
require('./js/fightScene.js');
require('./js/main.js');

SF.boot();
