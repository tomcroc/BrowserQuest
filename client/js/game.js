globalSprites = {};
globalInventoryItems = {};

define(['spell', 'skillbar', 'infomanager', 'bubble', 'renderer', 'map', 'animation', 'sprite', 'tile',
    'hero', 'gameclient', 'audio', 'updater', 'transition', 'pathfinder',
    'item', 'mob', 'npc', 'player', 'character', 'chest', 'mobs', 'exceptions', 'config', 'spelleffect', '../../shared/js/gametypes'
  ],
  function (Spell, Skillbar, InfoManager, BubbleManager, Renderer, Map, Animation, Sprite, AnimatedTile,
    Hero, GameClient, AudioManager, Updater, Transition, Pathfinder,
    Item, Mob, Npc, Player, Character, Chest, Mobs, Exceptions, config, SpellEffect) {

    var Game = Class.extend({
      init: function (app) {
        this.app = app;
        this.app.config = config;
        this.ready = false;
        this.started = false;
        this.hasNeverStarted = true;

        this.renderer = null;
        this.updater = null;
        this.pathfinder = null;
        this.chatinput = null;
        this.bubbleManager = null;
        this.audioManager = null;

        this.player = null;
        this.playerName = null;

        // Game state
        this.players = {};
        this.entities = {};
        this.deathpositions = {};
        this.entityGrid = null;
        this.pathingGrid = null;
        this.renderingGrid = null;
        this.itemGrid = null;
        this.currentCursor = null;
        this.mouse = {
          x: 0,
          y: 0
        };
        this.zoningQueue = [];
        this.previousClickPosition = {};

        this.selectedX = 0;
        this.selectedY = 0;
        this.selectedCellVisible = false;
        this.targetColor = "rgba(255, 255, 255, 0.5)";
        this.targetCellVisible = true;
        this.hoveringTarget = false;
        this.hoveringPlayer = false;
        this.hoveringMob = false;
        this.hoveringItem = false;
        this.hoveringCollidingTile = false;

        // combat
        this.infoManager = new InfoManager(this);

        // zoning
        this.currentZoning = null;

        this.cursors = {};

        this.sprites = {};

        // tile animation
        this.animatedTiles = [];

        // debug
        this.debugPathing = false;

        // sprites
        this.spriteNames = ["hand", "sword", "loot", "target", "talk", "sparks", "shadow16", "rat", "skeleton", "skeleton2", "spectre", "boss", "deathknight",
          "ogre", "crab", "snake", "eye", "bat", "goblin", "wizard", "guard", "king", "villagegirl", "villager", "coder", "agent", "rick", "scientist", "nyan", "priest",
          "sorcerer", "octocat", "beachnpc", "forestnpc", "desertnpc", "lavanpc", "clotharmor", "leatherarmor", "mailarmor",
          "platearmor", "redarmor", "goldenarmor", "firefox", "death", "sword1", "axe", "chest",
          "sword2", "redsword", "bluesword", "goldensword", "item-sword2", "item-axe", "item-redsword", "item-bluesword", "item-goldensword", "item-leatherarmor", "item-mailarmor",
          "item-platearmor", "item-redarmor", "item-goldenarmor", "item-flask", "item-cake", "item-burger", "morningstar", "item-morningstar", "item-firepotion",
          "spell-fireball"
        ];
      },

      setup: function ($bubbleContainer, canvas, background, foreground, input) {
        this.setBubbleManager(new BubbleManager($bubbleContainer));
        this.setRenderer(new Renderer(this, canvas, background, foreground));
        this.setChatInput(input);
      },

      addPlayer: function (player) {
        this.players[player.id] = player;
      },

      removePlayer: function (playerID) {
        delete this.players[playerID];
      },

      getPlayerByID: function (playerID) {
        return this.players[playerID];
      },

      getPlayersByIDs: function (ids) {
        return _.map(ids, function (id) {
          return this.getPlayerByID(id);
        }.bind(this));
      },

      getPlayerByName: function (name) {
        for (var i in this.players) {
          if (this.players[i].name == name) {
            return this.players[i];
          }
        }

        return null;
      },

      updateInventory: function () {
        this.app.updateInventory();
      },

      updateSkillbar: function () {
        this.app.updateSkillbar();
      },

      activateTownPortal: function () {
        if (this.player && !this.player.isDead) {
          var dest = {
            x: 36,
            y: 210,
            orientation: Types.Orientations.DOWN
          };
          this.teleport(dest);
        }
      },

      setStorage: function (storage) {
        this.storage = storage;
      },

      setRenderer: function (renderer) {
        this.renderer = renderer;
      },

      setUpdater: function (updater) {
        this.updater = updater;
      },

      setPathfinder: function (pathfinder) {
        this.pathfinder = pathfinder;
      },

      setChatInput: function (element) {
        this.chatinput = element;
      },

      setBubbleManager: function (bubbleManager) {
        this.bubbleManager = bubbleManager;
      },

      loadMap: function () {
        this.map = new Map(!this.renderer.upscaledRendering, this);

        this.map.ready(function () {
          log.info("Map loaded.");
          var tilesetIndex = this.renderer.upscaledRendering ? 0 : this.renderer.scale - 1;
          this.renderer.setTileset(this.map.tilesets[tilesetIndex]);
        }.bind(this));
      },

      initPlayer: function () {
        this.player.setStorage(this.storage);
        this.player.loadFromStorage(function () {
          this.updateBars();
        }.bind(this));

        this.player.setSprite(this.sprites["clotharmor"]);
        log.debug("Finished initPlayer");
      },

      resurrect: function () {
        this.client.sendResurrect();
      },

      initShadows: function () {
        this.shadows = {};
        this.shadows["small"] = this.sprites["shadow16"];
      },

      initCursors: function () {
        this.cursors["hand"] = this.sprites["hand"];
        this.cursors["sword"] = this.sprites["sword"];
        this.cursors["loot"] = this.sprites["loot"];
        this.cursors["target"] = this.sprites["target"];
        this.cursors["arrow"] = this.sprites["arrow"];
        this.cursors["talk"] = this.sprites["talk"];
      },

      initAnimations: function () {
        this.targetAnimation = new Animation("idle_down", 4, 0, 16, 16);
        this.targetAnimation.setSpeed(50);

        this.sparksAnimation = new Animation("idle_down", 6, 0, 16, 16);
        this.sparksAnimation.setSpeed(120);
      },

      initHurtSprites: function () {
        Types.forEachArmorKind(function (kind, kindName) {
          this.sprites[kindName].createHurtSprite();
        }.bind(this));
      },

      initSilhouettes: function () {
        Types.forEachMobOrNpcKind(function (kind, kindName) {
          this.sprites[kindName].createSilhouette();
        }.bind(this));
        this.sprites["chest"].createSilhouette();
        this.sprites["item-cake"].createSilhouette();
      },

      initAchievements: function () {
        this.achievements = {
          A_TRUE_WARRIOR: {
            id: 1,
            name: "A True Warrior",
            desc: "Find a new weapon"
          },
          INTO_THE_WILD: {
            id: 2,
            name: "Into the Wild",
            desc: "Venture outside the village"
          },
          ANGRY_RATS: {
            id: 3,
            name: "Angry Rats",
            desc: "Kill 10 rats",
            isCompleted: function () {
              return this.storage.getRatCount() >= 10;
            }.bind(this)
          },
          SMALL_TALK: {
            id: 4,
            name: "Small Talk",
            desc: "Talk to a non-player character"
          },
          FAT_LOOT: {
            id: 5,
            name: "Fat Loot",
            desc: "Get a new armor set"
          },
          UNDERGROUND: {
            id: 6,
            name: "Underground",
            desc: "Explore at least one cave"
          },
          AT_WORLDS_END: {
            id: 7,
            name: "At World's End",
            desc: "Reach the south shore"
          },
          COWARD: {
            id: 8,
            name: "Coward",
            desc: "Successfully escape an enemy"
          },
          TOMB_RAIDER: {
            id: 9,
            name: "Tomb Raider",
            desc: "Find the graveyard"
          },
          SKULL_COLLECTOR: {
            id: 10,
            name: "Skull Collector",
            desc: "Kill 10 skeletons",
            isCompleted: function () {
              return this.storage.getSkeletonCount() >= 10;
            }.bind(this)
          },
          NINJA_LOOT: {
            id: 11,
            name: "Ninja Loot",
            desc: "Get hold of an item you didn't fight for"
          },
          NO_MANS_LAND: {
            id: 12,
            name: "No Man's Land",
            desc: "Travel through the desert"
          },
          HUNTER: {
            id: 13,
            name: "Hunter",
            desc: "Kill 50 enemies",
            isCompleted: function () {
              return this.storage.getTotalKills() >= 50;
            }.bind(this)
          },
          STILL_ALIVE: {
            id: 14,
            name: "Still Alive",
            desc: "Revive your character five times",
            isCompleted: function () {
              return this.storage.getTotalRevives() >= 5;
            }.bind(this)
          },
          MEATSHIELD: {
            id: 15,
            name: "Meatshield",
            desc: "Take 5,000 points of damage",
            isCompleted: function () {
              return this.storage.getTotalDamageTaken() >= 5000;
            }.bind(this)
          },
          HOT_SPOT: {
            id: 16,
            name: "Hot Spot",
            desc: "Enter the volcanic mountains"
          },
          HERO: {
            id: 17,
            name: "Hero",
            desc: "Defeat the final boss"
          },
          FOXY: {
            id: 18,
            name: "Foxy",
            desc: "Find the Firefox costume",
            hidden: true
          },
          FOR_SCIENCE: {
            id: 19,
            name: "For Science",
            desc: "Enter into a portal",
            hidden: true
          },
          RICKROLLD: {
            id: 20,
            name: "Rickroll'd",
            desc: "Take some singing lessons",
            hidden: true
          }
        };

        _.each(this.achievements, function (obj) {
          if (!obj.isCompleted) {
            obj.isCompleted = function () {
              return true;
            }
          }
          if (!obj.hidden) {
            obj.hidden = false;
          }
        });

        this.app.initAchievementList(this.achievements);

        if (this.storage.hasAlreadyPlayed()) {
          this.app.initUnlockedAchievements(this.storage.data.achievements.unlocked);
        }
      },

      getAchievementById: function (id) {
        var found = null;
        _.each(this.achievements, function (achievement, key) {
          if (achievement.id === parseInt(id)) {
            found = achievement;
          }
        });
        return found;
      },

      loadSprite: function (name) {
        if (this.renderer.upscaledRendering) {
          this.spritesets[0][name] = new Sprite(name, 1);
        } else {
          this.spritesets[1][name] = new Sprite(name, 2);
          if (!this.renderer.mobile && !this.renderer.tablet) {
            this.spritesets[2][name] = new Sprite(name, 3);
          }
        }
      },

      setSpriteScale: function (scale) {
        if (this.renderer.upscaledRendering) {
          this.sprites = this.spritesets[0];
        } else {
          this.sprites = this.spritesets[scale - 1];

          _.each(this.entities, function (entity) {
            var kindString = Types.getKindAsString(entity.skin);
            if (entity instanceof Item) {
              kindString = "item-" + kindString;
            }
            entity.setSprite(this.sprites[kindString]);
          }.bind(this));
          this.initHurtSprites();
          this.initShadows();
          this.initCursors();
        }

        globalSprites = this.sprites;
      },

      loadSprites: function () {
        log.info("Loading sprites...");
        this.spritesets = [];
        this.spritesets[0] = {};
        this.spritesets[1] = {};
        this.spritesets[2] = {};
        _.map(this.spriteNames, this.loadSprite, this);
      },

      spritesLoaded: function () {
        if (_.any(this.sprites, function (sprite) {
          return !sprite.isLoaded;
        })) {
          return false;
        }
        return true;
      },

      setCursor: function (name, orientation) {
        if (name in this.cursors) {
          this.currentCursor = this.cursors[name];
          this.currentCursorOrientation = orientation;
        } else {
          log.error("Unknown cursor name :" + name);
        }
      },

      updateCursorLogic: function () {
        if (this.hoveringCollidingTile && this.started) {
          this.targetColor = "rgba(255, 50, 50, 0.5)";
        } else {
          this.targetColor = "rgba(255, 255, 255, 0.5)";
        }

        if (this.hoveringPlayer && this.player.isHostile(this.hoveringPlayer) && this.started) {
          this.setCursor("sword");
          this.hoveringTarget = false;
          this.targetCellVisible = false;
        } else if (this.hoveringMob && this.started) {
          this.setCursor("sword");
          this.hoveringTarget = false;
          this.targetCellVisible = false;
        } else if (this.hoveringNpc && this.started) {
          this.setCursor("talk");
          this.hoveringTarget = false;
          this.targetCellVisible = false;
        } else if ((this.hoveringItem || this.hoveringChest) && this.started) {
          this.setCursor("loot");
          this.hoveringTarget = false;
          this.targetCellVisible = true;
        } else {
          this.setCursor("hand");
          this.hoveringTarget = false;
          this.targetCellVisible = true;
        }
      },

      focusPlayer: function () {
        this.renderer.camera.lookAt(this.player);
      },

      addEntity: function (entity) {
        if (this.entities[entity.id] === undefined) {
          this.entities[entity.id] = entity;
          this.registerEntityPosition(entity);

          if (!(entity instanceof Item && entity.wasDropped) && !(this.renderer.mobile || this.renderer.tablet)) {
            entity.fadeIn(this.currentTime);
          }

          if (this.renderer.mobile || this.renderer.tablet) {
            entity.on("dirty", function () {
              if (this.camera.isVisible(this)) {
                this.dirtyRect = this.renderer.getEntityBoundingRect(this);
                this.checkOtherDirtyRects(this.dirtyRect, this, this.gridX, this.gridY);
              }
            }.bind(this));
          }
        } else {
          log.error("This entity already exists : " + entity.id + " (" + entity.kind + ")");
        }
      },

      removeAllEntities: function () {
        for (var entityId in this.entities) {
          this.unregisterEntityPosition(this.entities[entityId]);
          delete this.entities[entityId];
        }
      },

      removeEntity: function (entity) {
        if (entity.id in this.entities) {
          this.unregisterEntityPosition(entity);
          delete this.entities[entity.id];
        } else {
          log.error("Cannot remove entity. Unknown ID : " + entity.id);
        }
      },

      addSpellEffect: function (spellEffect, x, y) {
        spellEffect.setSprite(this.sprites[spellEffect.getSpriteName()], spellEffect.getSpriteName());
        spellEffect.setGridPosition(x, y);
        spellEffect.setAnimation("idle", 150);
        this.addEntity(spellEffect);
      },

      removeSpellEffect: function (spellEffect) {
        if (spellEffect) {
          spellEffect.removed = true;

          this.removeFromRenderingGrid(spellEffect, spellEffect.gridX, spellEffect.gridY);
          delete this.entities[spellEffect.id];
        } else {
          log.error("Cannot remove spell effect. Unknown ID : " + spellEffect.id);
        }
      },

      addItem: function (item, x, y) {
        var kindString = "item-" + Types.getKindAsString(item.skin);
        item.setSprite(this.sprites[kindString], kindString);
        item.setGridPosition(x, y);
        item.setAnimation("idle", 150);
        this.addEntity(item);
      },

      removeItem: function (item) {
        if (item) {
          item.removed = true;

          this.removeFromItemGrid(item, item.gridX, item.gridY);
          this.removeFromRenderingGrid(item, item.gridX, item.gridY);
          delete this.entities[item.id];
        } else {
          log.error("Cannot remove item. Unknown ID : " + item.id);
        }
      },

      initPathingGrid: function () {
        this.pathingGrid = [];
        for (var i = 0; i < this.map.height; i += 1) {
          this.pathingGrid[i] = [];
          for (var j = 0; j < this.map.width; j += 1) {
            this.pathingGrid[i][j] = this.map.grid[i][j];
          }
        }
        log.info("Initialized the pathing grid with static colliding cells.");
      },

      initEntityGrid: function () {
        this.entityGrid = [];
        for (var i = 0; i < this.map.height; i += 1) {
          this.entityGrid[i] = [];
          for (var j = 0; j < this.map.width; j += 1) {
            this.entityGrid[i][j] = {};
          }
        }
        log.info("Initialized the entity grid.");
      },

      initRenderingGrid: function () {
        this.renderingGrid = [];
        for (var i = 0; i < this.map.height; i += 1) {
          this.renderingGrid[i] = [];
          for (var j = 0; j < this.map.width; j += 1) {
            this.renderingGrid[i][j] = {};
          }
        }
        log.info("Initialized the rendering grid.");
      },

      initItemGrid: function () {
        this.itemGrid = [];
        for (var i = 0; i < this.map.height; i += 1) {
          this.itemGrid[i] = [];
          for (var j = 0; j < this.map.width; j += 1) {
            this.itemGrid[i][j] = {};
          }
        }
        log.info("Initialized the item grid.");
      },

      /**
       *
       */
      initAnimatedTiles: function () {
        this.animatedTiles = [];
        this.forEachVisibleTile(function (id, index) {
          if (this.map.isAnimatedTile(id)) {
            var tile = new AnimatedTile(id, this.map.getTileAnimationLength(id), this.map.getTileAnimationDelay(id), index),
              pos = this.map.tileIndexToGridPosition(tile.index);

            tile.x = pos.x;
            tile.y = pos.y;
            this.animatedTiles.push(tile);
          }
        }.bind(this), 1);
      },

      addToRenderingGrid: function (entity, x, y) {
        if (!this.map.isOutOfBounds(x, y)) {
          this.renderingGrid[y][x][entity.id] = entity;
        }
      },

      removeFromRenderingGrid: function (entity, x, y) {
        if (entity && this.renderingGrid[y][x] && entity.id in this.renderingGrid[y][x]) {
          delete this.renderingGrid[y][x][entity.id];
        }
      },

      removeFromEntityGrid: function (entity, x, y) {
        if (entity && this.entityGrid[y][x] && entity.id in this.entityGrid[y][x]) {
          delete this.entityGrid[y][x][entity.id];
        }
      },

      removeFromItemGrid: function (item, x, y) {
        if (item && this.itemGrid[y][x] && item.id in this.itemGrid[y][x]) {
          delete this.itemGrid[y][x][item.id];
        }
      },

      removeFromPathingGrid: function (x, y) {
        this.pathingGrid[y][x] = 0;
      },

      /**
       * Registers the entity at two adjacent positions on the grid at the same time.
       * This situation is temporary and should only occur when the entity is moving.
       * This is useful for the hit testing algorithm used when hovering entities with the mouse cursor.
       *
       * @param {Entity} entity The moving entity
       */
      registerEntityDualPosition: function (entity) {
        if (entity) {
          this.entityGrid[entity.gridY][entity.gridX][entity.id] = entity;

          this.addToRenderingGrid(entity, entity.gridX, entity.gridY);

          if (entity.nextGridX >= 0 && entity.nextGridY >= 0) {
            this.entityGrid[entity.nextGridY][entity.nextGridX][entity.id] = entity;
            if (false && !(entity instanceof Player)) {
              this.pathingGrid[entity.nextGridY][entity.nextGridX] = 1;
            }
          }
        }
      },

      /**
       * Clears the position(s) of this entity in the entity grid.
       *
       * @param {Entity} entity The moving entity
       */
      unregisterEntityPosition: function (entity) {
        if (entity) {
          this.removeFromEntityGrid(entity, entity.gridX, entity.gridY);
          this.removeFromPathingGrid(entity.gridX, entity.gridY);

          this.removeFromRenderingGrid(entity, entity.gridX, entity.gridY);

          if (entity.nextGridX >= 0 && entity.nextGridY >= 0) {
            this.removeFromEntityGrid(entity, entity.nextGridX, entity.nextGridY);
            this.removeFromPathingGrid(entity.nextGridX, entity.nextGridY);
          }
        }
      },

      registerEntityPosition: function (entity) {
        var x = entity.gridX,
          y = entity.gridY;

        if (entity) {
          if (entity instanceof Character || entity instanceof Chest) {
            this.entityGrid[y][x][entity.id] = entity;
            if (entity instanceof Chest) {
              this.pathingGrid[y][x] = 1;
            }
          }
          if (entity instanceof Item) {
            this.itemGrid[y][x][entity.id] = entity;
          }

          this.addToRenderingGrid(entity, x, y);
        }
      },

      setServerOptions: function (host, port, username) {
        this.host = host;
        this.port = port;
        this.username = username;
      },

      loadAudio: function () {
        this.audioManager = new AudioManager(this);
      },

      initMusicAreas: function () {
        _.each(this.map.musicAreas, function (area) {
          this.audioManager.addArea(area.x, area.y, area.w, area.h, area.id);
        }.bind(this));
      },

      run: function (started_callback) {
        this.loadSprites();
        this.setUpdater(new Updater(this));
        this.camera = this.renderer.camera;

        this.setSpriteScale(this.renderer.scale);

        var wait = setInterval(function () {
          if (!this.map.isLoaded || !this.spritesLoaded()) {
            return;
          }

          this.ready = true;
          log.debug('All sprites loaded.');

          this.loadAudio();

          this.initMusicAreas();
          this.initAchievements();
          this.initCursors();
          this.initAnimations();
          this.initShadows();
          this.initHurtSprites();

          if (!this.renderer.mobile && !this.renderer.tablet && this.renderer.upscaledRendering) {
            this.initSilhouettes();
          }

          this.initEntityGrid();
          this.initItemGrid();
          this.initPathingGrid();
          this.initRenderingGrid();

          this.setPathfinder(new Pathfinder(this.map.width, this.map.height));

          //this.initPlayer();
          this.setCursor("hand");

          this.connect(started_callback);

          clearInterval(wait);
        }.bind(this), 100);
      },

      tick: function () {
        this.currentTime = new Date().getTime();

        if (this.started) {
          this.updateCursorLogic();
          this.updater.update();
          this.renderer.renderFrame();
        }

        if (!this.isStopped) {
          requestAnimFrame(this.tick.bind(this));
        }
      },

      start: function () {
        this.tick();
        this.hasNeverStarted = false;
        log.info("Game loop started.");
      },

      stop: function () {
        log.info("Game stopped.");
        this.isStopped = true;
      },

      entityIdExists: function (id) {
        return id in this.entities;
      },

      getEntityById: function (id, noError) {
        if (id in this.entities) {
          return this.entities[id];
        }

        // check if it's a player entity, and if so, don't cry about it
        if (id in this.players) {
          return null;
        }

        if (!noError) {
          log.error("Unknown entity id : " + id, true);
        }
      },

      getEntitiesByIDs: function (ids, noError) {
        return _.map(ids, function (id) {
          return this.getEntityById(id, noError);
        }.bind(this));
      },

      connect: function (started_callback) {
        var connecting = false; // always in dispatcher mode in the build version

        this.client = new GameClient(this.host, this.port);
        this.client.chat.setInput(this.chatinput);

        //>>excludeStart("prodHost", pragmas.prodHost);
        var config = this.app.config.local || this.app.config.dev;
        if (config) {
          this.client.connect(config.dispatcher); // false if the client connects directly to a game server
          connecting = true;
        }
        //>>excludeEnd("prodHost");

        //>>includeStart("prodHost", pragmas.prodHost);
        if (!connecting) {
          this.client.connect(true); // always use the dispatcher in production
        }
        //>>includeEnd("prodHost");

        this.client.on("Dispatched", function (host, port) {
          log.debug("Dispatched to game server " + host + ":" + port);

          this.client.host = host;
          this.client.port = port;
          this.player.isDying = false;
          this.client.connect(); // connect to actual game server
        }.bind(this));

        this.client.on("Connected", function () {
          log.info("Starting client/server handshake");

          this.playerName = this.username;
          this.started = true;

          this.sendHello();
        }.bind(this));

        this.client.on("EntityList", function (list) {
          var entityIds = _.pluck(this.entities, 'id'),
            knownIds = _.intersection(entityIds, list),
            newIds = _.difference(list, knownIds);

          this.obsoleteEntities = _.reject(this.entities, function (entity) {
            return _.include(knownIds, entity.id) || entity.id === this.player.id;
          }.bind(this));

          // Destroy entities outside of the player's zone group
          this.removeObsoleteEntities();

          // Ask the server for spawn information about unknown entities
          if (_.size(newIds) > 0) {
            this.client.sendWho(newIds);
          }
        }.bind(this));

        this.client.on("Welcome", function (data) {
          // Player
          if (this.player) {
            this.player.idle();
            this.player.removed = false;
          } else {
            this.player = new Hero("player", "");
          }

          // make events from player to bubble to game
          this.player.bubbleTo(this);

          this.app.initBars();
          log.debug("initiated bars");

          this.player.isDead = false;
          this.player.isDying = false;

          this.player.loadFromObject(data);

          this.addPlayer(this.player);

          log.info("Received player ID from server : " + this.player.id);

          this.updateBars();
          this.resetCamera();
          this.updatePlateauMode();
          this.audioManager.updateMusic();

          this.addEntity(this.player);
          this.player.dirtyRect = this.renderer.getEntityBoundingRect(this.player);

          this.initPlayer();
          this.player.idle();

          setTimeout(function () {
            this.tryUnlockingAchievement("STILL_ALIVE");
          }.bind(this), 1500);

          if (!this.storage.hasAlreadyPlayed()) {
            this.storage.initPlayer(this.player.name);
            this.storage.savePlayer(this.renderer.getPlayerImage(), this.player);
            this.showNotification("Welcome to BrowserQuest!");
          } else {
            this.showNotification("Welcome back to BrowserQuest!");
          }

          if (this.hasNeverStarted) {
            this.start();
            started_callback();
          }
        }.bind(this));
      },

      /**
       * Links two entities in an attacker<-->target relationship.
       * This is just a utility method to wrap a set of instructions.
       *
       * @param {Entity} attacker The attacker entity
       * @param {Entity} target The target entity
       */
      createAttackLink: function (attacker, target) {
        if (attacker.hasTarget()) {
          attacker.removeTarget();
        }
        attacker.engage(target);

        if (this.player && attacker.id !== this.player.id) {
          target.addAttacker(attacker);
        }
      },

      /**
       * Sends a "hello" message to the server, as a way of initiating the player connection handshake.
       * @see GameClient.sendHello
       */
      sendHello: function (isResurrection) {
        this.client.sendHello(this.playerName, isResurrection);
      },

      /**
       * Converts the current mouse position on the screen to world grid coordinates.
       * @returns {Object} An object containing x and y properties.
       */
      getMouseGridPosition: function () {
        var mx = this.mouse.x,
          my = this.mouse.y,
          c = this.renderer.camera,
          s = this.renderer.scale,
          ts = this.renderer.tilesize,
          offsetX = mx % (ts * s),
          offsetY = my % (ts * s),
          x = ((mx - offsetX) / (ts * s)) + c.gridX,
          y = ((my - offsetY) / (ts * s)) + c.gridY;

        return {
          x: x,
          y: y
        };
      },

      /**
       * Moves a character to a given location on the world grid.
       *
       * @param {Number} x The x coordinate of the target location.
       * @param {Number} y The y coordinate of the target location.
       */
      makeCharacterGoTo: function (character, x, y) {
        if (!this.map.isOutOfBounds(x, y)) {
          character.go(x, y);
        }
      },

      /**
       *
       */
      makeCharacterTeleportTo: function (character, x, y) {
        if (!this.map.isOutOfBounds(x, y)) {
          this.unregisterEntityPosition(character);

          character.setGridPosition(x, y);

          this.registerEntityPosition(character);
          this.assignBubbleTo(character);
        } else {
          log.debug("Teleport out of bounds: " + x + ", " + y);
        }
      },

      makePlayerTargetNearestEnemy: function () {
        var enemies = this.player.getNearestEnemies(this.entities);
        if (enemies.length > 0) {
          this.player.setTarget(enemies[0]);
        }
      },

      /**
       *
       */
      makePlayerAttackNext: function () {
        var pos = {
          x: this.player.gridX,
          y: this.player.gridY
        };
        switch (this.player.orientation) {
        case Types.Orientations.DOWN:
          pos.y += 1;
          this.makePlayerAttackTo(pos);
          break;
        case Types.Orientations.UP:
          pos.y -= 1;
          this.makePlayerAttackTo(pos);
          break;
        case Types.Orientations.LEFT:
          pos.x -= 1;
          this.makePlayerAttackTo(pos);
          break;
        case Types.Orientations.RIGHT:
          pos.x += 1;
          this.makePlayerAttackTo(pos);
          break;

        default:
          break;
        }
      },

      /**
       *
       */
      makePlayerAttackTo: function (pos) {
        entity = this.getEntityAt(pos.x, pos.y);
        if (this.player.isHostile(entity)) {
          this.makePlayerAttack(entity);
        }
      },

      /**
       * Moves the current player to a given target location.
       * @see makeCharacterGoTo
       */
      makePlayerGoTo: function (x, y) {
        this.makeCharacterGoTo(this.player, x, y);
      },

      /**
       * Moves the current player towards a specific item.
       * @see makeCharacterGoTo
       */
      makePlayerGoToItem: function (item) {
        if (item) {
          this.player.isLootMoving = true;
          this.makePlayerGoTo(item.gridX, item.gridY);
          this.client.sendMove(item.x, item.y);
        }
      },

      /**
       *
       */
      makePlayerTalkTo: function (npc) {
        if (npc) {
          this.player.setTarget(npc);
          this.player.follow(npc);
        }
      },

      makePlayerOpenChest: function (chest) {
        if (chest) {
          this.player.setTarget(chest);
          this.player.follow(chest);
        }
      },

      /**
       *
       */
      makePlayerAttack: function (mob) {
        this.createAttackLink(this.player, mob);
        this.client.sendAttack(mob);
      },

      makePlayerAttackTarget: function () {
        if (this.player.target) {
          this.makePlayerAttack(this.player.target);
        }
      },

      /**
       *
       */
      makeNpcTalk: function (npc) {
        var msg;

        if (npc) {
          msg = npc.talk();
          this.previousClickPosition = {};
          if (msg) {
            this.createBubble(npc.id, msg);
            this.assignBubbleTo(npc);
            this.audioManager.playSound("npc");
          } else {
            this.destroyBubble(npc.id);
            this.audioManager.playSound("npc-end");
          }
          this.tryUnlockingAchievement("SMALL_TALK");

          if (npc.kind === Types.Entities.RICK) {
            this.tryUnlockingAchievement("RICKROLLD");
          }
        }
      },

      /**
       * Loops through all the entities currently present in the game.
       * @param {Function} callback The function to call back (must accept one entity argument).
       */
      forEachEntity: function (callback) {
        _.each(this.entities, function (entity) {
          callback(entity);
        });
      },

      /**
       * Same as forEachEntity but only for instances of the Mob subclass.
       * @see forEachEntity
       */
      forEachMob: function (callback) {
        _.each(this.entities, function (entity) {
          if (entity instanceof Mob) {
            callback(entity);
          }
        });
      },

      /**
       * Loops through all entities visible by the camera and sorted by depth :
       * Lower 'y' value means higher depth.
       * Note: This is used by the Renderer to know in which order to render entities.
       */
      forEachVisibleEntityByDepth: function (callback) {
        var m = this.map;

        this.camera.forEachVisiblePosition(function (x, y) {
          if (!m.isOutOfBounds(x, y)) {
            if (this.renderingGrid[y][x]) {
              _.each(this.renderingGrid[y][x], function (entity) {
                callback(entity);
              });
            }
          }
        }.bind(this), this.renderer.mobile ? 0 : 2);
      },

      /**
       *
       */
      forEachVisibleTileIndex: function (callback, extra) {
        var m = this.map;

        this.camera.forEachVisiblePosition(function (x, y) {
          if (!m.isOutOfBounds(x, y)) {
            callback(m.GridPositionToTileIndex(x, y) - 1);
          }
        }, extra);
      },

      /**
       *
       */
      forEachVisibleTile: function (callback, extra) {
        if (!this.map.isLoaded) {
          return;
        }

        this.forEachVisibleTileIndex(function (tileIndex) {
          if (_.isArray(this.map.data[tileIndex])) {
            _.each(this.map.data[tileIndex], function (id) {
              callback(id - 1, tileIndex);
            });
          } else {
            if (_.isNaN(this.map.data[tileIndex] - 1)) {
              //throw Error("Tile number for index:"+tileIndex+" is NaN");
            } else {
              callback(this.map.data[tileIndex] - 1, tileIndex);
            }
          }
        }.bind(this), extra);
      },

      /**
       *
       */
      forEachAnimatedTile: function (callback) {
        _.each(this.animatedTiles, function (tile) {
          callback(tile);
        });
      },

      /**
       * Returns the entity located at the given position on the world grid.
       * @returns {Entity} the entity located at (x, y) or null if there is none.
       */
      getEntityAt: function (x, y) {
        if (this.map.isOutOfBounds(x, y) || !this.entityGrid) {
          return null;
        }

        var entities = this.entityGrid[y][x],
          entity = null;
        if (_.size(entities) > 0) {
          entity = entities[_.keys(entities)[0]];
        } else {
          entity = this.getItemAt(x, y);
        }
        return entity;
      },

      getPlayerAt: function (x, y) {
        var entity = this.getEntityAt(x, y);
        if (entity && (entity instanceof Player)) {
          return entity;
        }
        return null;
      },

      getMobAt: function (x, y) {
        var entity = this.getEntityAt(x, y);
        if (entity && (entity instanceof Mob)) {
          return entity;
        }
        return null;
      },

      getNpcAt: function (x, y) {
        var entity = this.getEntityAt(x, y);
        if (entity && (entity instanceof Npc)) {
          return entity;
        }
        return null;
      },

      getChestAt: function (x, y) {
        var entity = this.getEntityAt(x, y);
        if (entity && (entity instanceof Chest)) {
          return entity;
        }
        return null;
      },

      getItemAt: function (x, y) {
        if (this.map.isOutOfBounds(x, y) || !this.itemGrid) {
          return null;
        }
        var items = this.itemGrid[y][x],
          item = null;

        if (_.size(items) > 0) {
          // If there are potions/burgers stacked with equipment items on the same tile, always get expendable items first.
          _.each(items, function (i) {
            if (Types.isExpendableItem(i.kind)) {
              item = i;
            };
          });

          // Else, get the first item of the stack
          if (!item) {
            item = items[_.keys(items)[0]];
          }
        }
        return item;
      },

      /**
       * Returns true if an entity is located at the given position on the world grid.
       * @returns {Boolean} Whether an entity is at (x, y).
       */
      isEntityAt: function (x, y) {
        return !_.isNull(this.getEntityAt(x, y));
      },

      isPlayerAt: function (x, y) {
        return !_.isNull(this.getPlayerAt(x, y));
      },

      isMobAt: function (x, y) {
        return !_.isNull(this.getMobAt(x, y));
      },

      isItemAt: function (x, y) {
        return !_.isNull(this.getItemAt(x, y));
      },

      isNpcAt: function (x, y) {
        return !_.isNull(this.getNpcAt(x, y));
      },

      isChestAt: function (x, y) {
        return !_.isNull(this.getChestAt(x, y));
      },

      /**
       * Finds a path to a grid position for the specified character.
       * The path will pass through any entity present in the ignore list.
       */
      findPath: function (character, x, y, ignoreList) {
        if (this.map.isColliding(x, y)) {
          return [];
        }

        var path = [];
        if (this.pathfinder && character) {
          if (ignoreList) {
            _.each(ignoreList, function (entity) {
              this.pathfinder.ignoreEntity(entity);
            }.bind(this));
          }

          path = this.pathfinder.findPath(this.pathingGrid, character, x, y, false);

          if (ignoreList) {
            this.pathfinder.clearIgnoreList();
          }
        } else {
          log.error("Error while finding the path to " + x + ", " + y + " for " + character.id);
        }

        return path;
      },

      /**
       * Toggles the visibility of the pathing grid for debugging purposes.
       */
      togglePathingGrid: function () {
        if (this.debugPathing) {
          this.debugPathing = false;
        } else {
          this.debugPathing = true;
        }
      },

      /**
       * Toggles the visibility of the FPS counter and other debugging info.
       */
      toggleDebugInfo: function () {
        if (this.renderer && this.renderer.isDebugInfoVisible) {
          this.renderer.isDebugInfoVisible = false;
        } else {
          this.renderer.isDebugInfoVisible = true;
        }
      },

      /**
       *
       */
      movecursor: function () {
        var mouse = this.getMouseGridPosition(),
          x = mouse.x,
          y = mouse.y;

        if (this.player && !this.renderer.mobile && !this.renderer.tablet) {
          this.hoveringCollidingTile = this.map.isColliding(x, y);
          this.hoveringPlateauTile = this.player.isOnPlateau ? !this.map.isPlateau(x, y) : this.map.isPlateau(x, y);
          this.hoveringPlayer = this.getPlayerAt(x, y);
          this.hoveringMob = this.getMobAt(x, y);
          this.hoveringItem = this.getItemAt(x, y);
          this.hoveringNpc = this.getNpcAt(x, y);
          this.hoveringChest = this.getChestAt(x, y);

          var entity = this.hoveringPlayer | this.hoveringMob | this.hoveringNpc | this.hoveringChest;

          if (entity) {
            if (!entity.isHighlighted && this.renderer.supportsSilhouettes) {
              if (this.lastHovered) {
                this.lastHovered.setHighlight(false);
              }
              this.lastHovered = entity;
              entity.setHighlight(true);
            }
          } else if (this.lastHovered) {
            this.lastHovered.setHighlight(false);
            this.lastHovered = null;
          }
        }
      },

      /**         
       * Moves the player one space, if possible
       */
      keys: function (pos, orientation) {
        oldHoveringCollidingValue = this.hoveringCollidingTile;
        this.hoveringCollidingTile = false;

        this.player.orientation = orientation;
        this.player.idle();
        this.processInput(pos, true);

        this.hoveringCollidingTile = oldHoveringCollidingValue;
      },

      click: function () {
        this.selectedCellVisible = true;

        var pos = this.getMouseGridPosition();

        if (pos.x === this.previousClickPosition.x && pos.y === this.previousClickPosition.y) {
          return;
        } else {
          this.previousClickPosition = pos;
        }

        this.processInput(pos);
      },

      /**
       * Processes game logic when the user triggers a click/touch event during the game.
       */
      processInput: function (pos, isKeyboard) {
        var entity;

        if (this.started && this.player && !this.isZoning() && !this.isZoningTile(this.player.nextGridX, this.player.nextGridY) && !this.player.isDead && !this.hoveringCollidingTile && !this.hoveringPlateauTile) {
          entity = this.getEntityAt(pos.x, pos.y);

          if (!isKeyboard && entity && entity.interactable) {
            if (entity instanceof Mob || entity instanceof Player) {
              this.player.target = entity;
            } else if (entity instanceof Item) {
              this.makePlayerGoToItem(entity);
            } else if (entity instanceof Npc) {
              if (this.player.isAdjacentNonDiagonal(entity) === false) {
                this.makePlayerTalkTo(entity);
              } else {
                this.makeNpcTalk(entity);
              }
            } else if (entity instanceof Chest) {
              this.makePlayerOpenChest(entity);
            }
          } else {
            this.makePlayerGoTo(pos.x, pos.y);
          }
        }
      },

      isMobOnSameTile: function (mob, x, y) {
        var X = x || mob.gridX,
          Y = y || mob.gridY,
          list = this.entityGrid[Y][X],
          result = false;

        _.each(list, function (entity) {
          if (entity instanceof Mob && entity.id !== mob.id) {
            result = true;
          }
        });
        return result;
      },

      getFreeAdjacentNonDiagonalPosition: function (entity) {
        var result = null;

        entity.forEachAdjacentNonDiagonalPosition(function (x, y, orientation) {
          if (!result && !this.map.isColliding(x, y) && !this.isMobAt(x, y)) {
            result = {
              x: x,
              y: y,
              o: orientation
            };
          }
        }.bind(this));
        
        return result;
      },

      tryMovingToADifferentTile: function (character) {
        var attacker = character,
          target = character.target;

        if (attacker && target && target instanceof Player) {
          if (!target.isMoving() && attacker.getDistanceToEntity(target) === 0) {
            var pos;

            switch (target.orientation) {
            case Types.Orientations.UP:
              pos = {
                x: target.gridX,
                y: target.gridY - 1,
                o: target.orientation
              };
              break;
            case Types.Orientations.DOWN:
              pos = {
                x: target.gridX,
                y: target.gridY + 1,
                o: target.orientation
              };
              break;
            case Types.Orientations.LEFT:
              pos = {
                x: target.gridX - 1,
                y: target.gridY,
                o: target.orientation
              };
              break;
            case Types.Orientations.RIGHT:
              pos = {
                x: target.gridX + 1,
                y: target.gridY,
                o: target.orientation
              };
              break;
            }

            if (pos) {
              attacker.previousTarget = target;
              attacker.disengage();
              attacker.idle();
              this.makeCharacterGoTo(attacker, pos.x, pos.y);
              target.adjacentTiles[pos.o] = true;

              return true;
            }
          }

          if (!target.isMoving() && attacker.isAdjacentNonDiagonal(target) && this.isMobOnSameTile(attacker)) {
            var pos = this.getFreeAdjacentNonDiagonalPosition(target);

            // avoid stacking mobs on the same tile next to a player
            // by making them go to adjacent tiles if they are available
            if (pos && !target.adjacentTiles[pos.o]) {
              if (this.player.target && attacker.id === this.player.target.id) {
                return false; // never unstack the player's target
              }

              attacker.previousTarget = target;
              attacker.disengage();
              attacker.idle();
              this.makeCharacterGoTo(attacker, pos.x, pos.y);
              target.adjacentTiles[pos.o] = true;

              return true;
            }
          }
        }
        return false;
      },

      /**
       *
       */
      updateCharacter: function (character) {
        var time = this.currentTime;

        // If mob has finished moving to a different tile in order to avoid stacking, attack again from the new position.
        if (character.previousTarget && !character.isMoving() && character instanceof Mob) {
          var t = character.previousTarget;

          if (this.getEntityById(t.id)) { // does it still exist?
            character.previousTarget = null;
            this.createAttackLink(character, t);
            return;
          }
        }

        if (character.isAttacking() && !character.previousTarget) {
          var isMoving = this.tryMovingToADifferentTile(character); // Don't let multiple mobs stack on the same tile when attacking a player.

          if (character.canAttack(time)) {
            if (!isMoving) { // don't hit target if moving to a different tile.
              if (character.hasTarget() && character.getOrientationTo(character.target) !== character.orientation) {
                character.lookAtTarget();
              }

              character.hit();

              if (this.player && character.id === this.player.id) {
                this.client.sendHit(character.target);
              }

              if (character instanceof Player && this.camera.isVisible(character)) {
                this.audioManager.playSound("hit" + Math.floor(Math.random() * 2 + 1));
              }

              if (character.hasTarget() && this.player && character.target.id === this.player.id && !this.player.invincible) {
                this.client.sendHurt(character);
              }
            }
          } else if (character.hasTarget() 
                     && character.isDiagonallyAdjacent(character.target) 
                     && character.target instanceof Player 
                     && !character.target.isMoving()) {
            character.follow(character.target);
          }
        }
      },

      /**
       *
       */
      isZoningTile: function (x, y) {
        var c = this.camera;

        x = x - c.gridX;
        y = y - c.gridY;

        if (x === 0 || y === 0 || x === c.gridW - 1 || y === c.gridH - 1) {
          return true;
        }
        return false;
      },

      /**
       *
       */
      getZoningOrientation: function (x, y) {
        var orientation = "",
          c = this.camera;

        x = x - c.gridX;
        y = y - c.gridY;

        if (x === 0) {
          orientation = Types.Orientations.LEFT;
        } else if (y === 0) {
          orientation = Types.Orientations.UP;
        } else if (x === c.gridW - 1) {
          orientation = Types.Orientations.RIGHT;
        } else if (y === c.gridH - 1) {
          orientation = Types.Orientations.DOWN;
        }

        return orientation;
      },

      startZoningFrom: function (x, y) {
        this.zoningOrientation = this.getZoningOrientation(x, y);

        if (this.renderer.mobile || this.renderer.tablet) {
          var z = this.zoningOrientation,
            c = this.camera,
            ts = this.renderer.tilesize,
            x = c.x,
            y = c.y,
            xoffset = (c.gridW - 2) * ts,
            yoffset = (c.gridH - 2) * ts;

          if (z === Types.Orientations.LEFT || z === Types.Orientations.RIGHT) {
            x = (z === Types.Orientations.LEFT) ? c.x - xoffset : c.x + xoffset;
          } else if (z === Types.Orientations.UP || z === Types.Orientations.DOWN) {
            y = (z === Types.Orientations.UP) ? c.y - yoffset : c.y + yoffset;
          }
          c.setPosition(x, y);

          this.renderer.clearScreen(this.renderer.context);
          this.endZoning();

          // Force immediate drawing of all visible entities in the new zone
          this.forEachVisibleEntityByDepth(function (entity) {
            entity.dirty();
          });
        } else {
          this.currentZoning = new Transition();
        }
        this.bubbleManager.clean();
        this.client.sendZone();
      },

      enqueueZoningFrom: function (x, y) {
        this.zoningQueue.push({
          x: x,
          y: y
        });

        if (this.zoningQueue.length === 1) {
          this.startZoningFrom(x, y);
        }
      },

      endZoning: function () {
        this.currentZoning = null;
        this.resetZone();
        this.zoningQueue.shift();

        if (this.zoningQueue.length > 0) {
          var pos = this.zoningQueue[0];
          this.startZoningFrom(pos.x, pos.y);
        }
      },

      isZoning: function () {
        return !_.isNull(this.currentZoning);
      },

      resetZone: function () {
        this.bubbleManager.clean();
        this.initAnimatedTiles();
        this.renderer.renderStaticCanvases();
      },

      resetCamera: function () {
        this.camera.focusEntity(this.player);
        this.resetZone();
      },

      say: function (message) {
        if (message.indexOf("/") === 0) {
          // command given
          var firstSpaceIndex = message.indexOf(" ");
          var command = message.substring(1, firstSpaceIndex > -1 ? firstSpaceIndex : message.length);
          var rest = message.substring(firstSpaceIndex > -1 ? firstSpaceIndex + 1 : message.length);
          var args = message.substring(1).split(" ");

          if (command == "global" || command == "g") {
            this.client.setChatChannel("global");
            this.client.sendChat(rest);
          } else if (command == "say" || command == "s") {
            this.client.setChatChannel("say");
            this.client.sendChat(rest);
          } else if (command == "yell" || command == "y") {
            this.client.setChatChannel("yell");
            this.client.sendChat(rest);
          } else if (command == "party" || command == "p") {
            if (!this.player.party) {
              this.client.error("You are not in a party.");
              return;
            }
            this.client.setChatChannel("party");
            this.client.sendChat(rest);
          } else if (command == "invite") {
            var player = this.getPlayerByName(args[1]);
            if (!player) {
              this.client.error("Unknown player '%s'.", args[1]);
              return;
            }

            if (player == this.player) {
              this.client.error("You cannot invite yourself to a party.");
              return;
            }

            if (this.player.party) {
              if (!this.player.party.isLeader(this.player)) {
                this.client.error("You must be the party leader to invite players.");
                return;
              }

              if (this.player.party.isFull()) {
                this.client.error("Your party is full. You cannot invite any one to it.");
                return;
              }
            }

            this.client.notice("Invited %s to your party.", player.name);
            this.client.sendPartyInvite(player.id);
          } else if (command == "kick") {
            var player = this.getPlayerByName(args[1]);
            if (!player) {
              this.client.error("Unknown player '%s'.", args[1]);
              return;
            }

            if (!this.player.party) {
              this.client.error("You are not in a party.");
              return
            }

            if (!this.player.party.isLeader(this.player)) {
              this.client.error("You must be the party leader to kick players.");
              return;
            }

            if (player == this.player) {
              this.client.error("You cannot kick yourself from a party.");
              return;
            }

            if (!this.player.party.isMember(player)) {
              this.client.error("%s is not a member of your party.");
              return;
            }

            this.client.sendPartyKick(player.id);
          } else if (command == "accept") {
            var player = this.getPlayerByName(args[1]);
            if (!player) {
              this.client.error("Unknown player '%s'.", args[1]);
              return;
            }

            this.client.sendPartyAccept(player.id);
          } else if (command == "leave") {
            this.client.sendPartyLeave();
          } else if (command == "leader") {
            var player = this.getPlayerByName(args[1]);
            if (!player) {
              this.client.error("Unknown player '%s'.", args[1]);
              return;
            }

            if (!this.player.party.isLeader(this.player)) {
              this.client.error("Only the party leader can promote a new leader.");
              return;
            }

            this.client.sendPartyLeaderChange(player.id);
          } else {
            this.client.error("Unknown command '%s' given.", command, rest);
          }

          return;
        }

        // no command given - this is a message to the default chat channel
        this.client.sendChat(message);
      },

      createBubble: function (id, message) {
        this.bubbleManager.create(id, message, this.currentTime);
      },

      destroyBubble: function (id) {
        this.bubbleManager.destroyBubble(id);
      },

      assignBubbleTo: function (character) {
        var bubble = this.bubbleManager.getBubbleById(character.id);

        if (bubble) {
          var s = this.renderer.scale,
            t = 16 * s, // tile size
            x = ((character.x - this.camera.x) * s),
            w = parseInt(bubble.element.css('width')) + 24,
            offset = (w / 2) - (t / 2),
            offsetY,
            y;

          if (character instanceof Npc) {
            offsetY = 0;
          } else {
            if (s === 2) {
              if (this.renderer.mobile) {
                offsetY = 0;
              } else {
                offsetY = 15;
              }
            } else {
              offsetY = 12;
            }
          }

          y = ((character.y - this.camera.y) * s) - (t * 2) - offsetY;

          bubble.element.css('left', x - offset + 'px');
          bubble.element.css('top', y + 'px');
        }
      },

      restart: function () {
        log.debug("Beginning restart");

        this.resurrect();

        this.storage.incrementRevives();

        if (this.renderer.mobile || this.renderer.tablet) {
          this.renderer.clearScreen(this.renderer.context);
        }

        log.debug("Finished restart");
      },

      disconnected: function (message) {
        $('#death').find('p').html(message + "<em>Please reload the page.</em>");
        $('#respawn').hide();
      },

      playerDeath: function () {
        if ($('body').hasClass('credits')) {
          $('body').removeClass('credits');
        }
        $('body').addClass('death');
      },

      playerChangedEquipment: function () {
        this.app.initEquipmentIcons();
      },

      playerInvincible: function (state) {
        if (state) {
          $('#player > .hitpoints').toggleClass('invincible', state);
          return;
        }

        $('#player > .hitpoints').toggleClass('invincible');
      },

      resize: function () {
        var x = this.camera.x,
          y = this.camera.y,
          currentScale = this.renderer.scale,
          newScale = this.renderer.getScaleFactor();

        this.renderer.rescale(newScale);
        this.camera = this.renderer.camera;
        this.camera.setPosition(x, y);

        this.renderer.renderStaticCanvases();
      },

      teleport: function (dest) {
        this.player.setGridPosition(dest.x, dest.y);
        this.player.nextGridX = dest.x;
        this.player.nextGridY = dest.y;
        this.player.turnTo(dest.orientation);
        this.client.sendTeleport(dest.x, dest.y);

        if (this.renderer.mobile && dest.cameraX && dest.cameraY) {
          this.camera.setGridPosition(dest.cameraX, dest.cameraY);
          this.resetZone();
        } else {
          if (dest.portal) {
            this.assignBubbleTo(this.player);
          } else {
            this.camera.focusEntity(this.player);
            this.resetZone();
          }
        }

        if (_.size(this.player.attackers) > 0) {
          setTimeout(function () {
            this.tryUnlockingAchievement("COWARD");
          }.bind(this), 500);
        }
        this.player.forEachAttacker(function (attacker) {
          attacker.disengage();
          attacker.idle();
        });

        this.updatePlateauMode();

        this.checkUndergroundAchievement();

        if (this.renderer.mobile || this.renderer.tablet) {
          // When rendering with dirty rects, clear the whole screen when entering a door.
          this.renderer.clearScreen(this.renderer.context);
        }

        if (dest.portal) {
          this.audioManager.playSound("teleport");
        }

        if (!this.player.isDead) {
          this.audioManager.updateMusic();
        }
      },

      updateBars: function () {
        this.app.updateInventory();
        this.app.updateSkillbar();
      },

      getDeadMobPosition: function (mobId) {
        var position;

        if (mobId in this.deathpositions) {
          position = this.deathpositions[mobId];
          delete this.deathpositions[mobId];
        }

        return position;
      },

      tryUnlockingAchievement: function (name) {
        var achievement = null;
        if (name in this.achievements) {
          achievement = this.achievements[name];

          if (achievement.isCompleted() && this.storage.unlockAchievement(achievement.id)) {
            this.app.unlockAchievement(achievement.id, achievement.name, achievement.desc);
            this.audioManager.playSound("achievement");
          }
        }
      },

      showNotification: function (message) {
        this.app.showMessage(message);
      },

      removeObsoleteEntities: function () {
        var nb = _.size(this.obsoleteEntities);

        if (nb > 0) {
          _.each(this.obsoleteEntities, function (entity) {
            if (entity.id != this.player.id) { // never remove yourself
              this.removeEntity(entity);
            }
          }.bind(this));
          log.debug("Removed " + nb + " entities: " + _.pluck(_.reject(this.obsoleteEntities, function (id) {
            return id === this.player.id;
          }.bind(this)), 'id'));
          this.obsoleteEntities = null;
        }
      },

      /**
       * Fake a mouse move event in order to update the cursor.
       *
       * For instance, to get rid of the sword cursor in case the mouse is still hovering over a dying mob.
       * Also useful when the mouse is hovering a tile where an item is appearing.
       */
      updateCursor: function () {
        this.movecursor();
        this.updateCursorLogic();
      },

      /**
       * Change player plateau mode when necessary
       */
      updatePlateauMode: function () {
        if (this.map.isPlateau(this.player.gridX, this.player.gridY)) {
          this.player.isOnPlateau = true;
        } else {
          this.player.isOnPlateau = false;
        }
      },

      updatePlayerCheckpoint: function () {
        var checkpoint = this.map.getCurrentCheckpoint(this.player);

        if (checkpoint) {
          var lastCheckpoint = this.player.lastCheckpoint;
          if (!lastCheckpoint || (lastCheckpoint && lastCheckpoint.id !== checkpoint.id)) {
            this.player.lastCheckpoint = checkpoint;
            this.client.sendCheck(checkpoint.id);
          }
        }
      },

      checkUndergroundAchievement: function () {
        var music = this.audioManager.getSurroundingMusic(this.player);

        if (music) {
          if (music.name === 'cave') {
            this.tryUnlockingAchievement("UNDERGROUND");
          }
        }
      },

      forEachEntityAround: function (x, y, r, callback) {
        for (var i = x - r, max_i = x + r; i <= max_i; i += 1) {
          for (var j = y - r, max_j = y + r; j <= max_j; j += 1) {
            if (!this.map.isOutOfBounds(i, j)) {
              _.each(this.renderingGrid[j][i], function (entity) {
                callback(entity);
              });
            }
          }
        }
      },

      checkOtherDirtyRects: function (r1, source, x, y) {
        var r = this.renderer;

        this.forEachEntityAround(x, y, 2, function (e2) {
          if (source && source.id && e2.id === source.id) {
            return;
          }
          if (!e2.isDirty) {
            var r2 = r.getEntityBoundingRect(e2);
            if (r.isIntersecting(r1, r2)) {
              e2.dirty();
            }
          }
        });

        if (source && !(source.hasOwnProperty("index"))) {
          this.forEachAnimatedTile(function (tile) {
            if (!tile.isDirty) {
              var r2 = r.getTileBoundingRect(tile);
              if (r.isIntersecting(r1, r2)) {
                tile.isDirty = true;
              }
            }
          });
        }

        if (!this.drawTarget && this.selectedCellVisible) {
          var targetRect = r.getTargetBoundingRect();
          if (r.isIntersecting(r1, targetRect)) {
            this.drawTarget = true;
            this.renderer.targetRect = targetRect;
          }
        }
      }
    });

    return Game;
  });
