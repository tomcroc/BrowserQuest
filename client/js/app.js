$dragSrc = null;
define(['jquery', 'storage', 'healthbar', '../../shared/js/gametypes'], function ($, Storage, Healthbar) {

  var App = Class.extend({
    init: function () {
      this.currentPage = 1;
      this.blinkInterval = null;
      this.previousState = null;
      this.isParchmentReady = true;
      this.ready = false;
      this.storage = new Storage();
      this.watchNameInputInterval = setInterval(this.toggleButton.bind(this), 100);
      this.$playButton = $('.play'),
      this.$playDiv = $('.play div');
    },

    setGame: function (game) {
      this.game = game;
      this.isMobile = this.game.renderer.mobile;
      this.isTablet = this.game.renderer.tablet;
      this.isDesktop = !(this.isMobile || this.isTablet);
      this.supportsWorkers = !! window.Worker;
      this.ready = true;
    },

    center: function () {
      window.scrollTo(0, 1);
    },

    canStartGame: function () {
      if (this.isDesktop) {
        return (this.game && this.game.map && this.game.map.isLoaded);
      } else {
        return this.game;
      }
    },

    tryStartingGame: function (username, starting_callback) {
      var $play = this.$playButton;

      if (username !== '') {
        if (!this.ready || !this.canStartGame()) {
          if (!this.isMobile) {
            // on desktop and tablets, add a spinner to the play button
            $play.addClass('loading');
          }
          this.$playDiv.unbind('click');
          var watchCanStart = setInterval(function () {
            log.debug("waiting...");
            if (this.canStartGame()) {
              setTimeout(function () {
                if (!this.isMobile) {
                  $play.removeClass('loading');
                }
              }.bind(this), 1500);
              clearInterval(watchCanStart);
              this.startGame(username, starting_callback);
            }
          }.bind(this), 100);
        } else {
          this.$playDiv.unbind('click');
          this.startGame(username, starting_callback);
        }
      }
    },

    startGame: function (username, starting_callback) {
      if (starting_callback) {
        starting_callback();
      }
      this.hideIntro(function () {
        if (!this.isDesktop) {
          // On mobile and tablet we load the map after the player has clicked
          // on the PLAY button instead of loading it in a web worker.
          this.game.loadMap();
        }
        this.start(username);
      }.bind(this));
    },

    start: function (username) {
      var firstTimePlaying = !this.storage.hasAlreadyPlayed();

      if (!username || this.game.started) {
        return;
      }

      var optionsSet = false;
      var config = this.config;

      //>>includeStart("devHost", pragmas.devHost);
      if (config.local) {
        log.debug("Starting game with local dev config.");
        this.game.setServerOptions(config.local.host, config.local.port, username);
      } else {
        log.debug("Starting game with default dev config.");
        this.game.setServerOptions(config.dev.host, config.dev.port, username);
      }
      optionsSet = true;
      //>>includeEnd("devHost");

      //>>includeStart("prodHost", pragmas.prodHost);
      if (!optionsSet) {
        log.debug("Starting game with build config.");
        this.game.setServerOptions(config.build.host, config.build.port, username);
      }
      //>>includeEnd("prodHost");

      this.center();
      this.game.run(function () {
        $('body').addClass('started');
        if (firstTimePlaying) {
          this.toggleInstructions();
        }
      }.bind(this));
    },

    setMouseCoordinates: function (event) {
      var gamePos = $('#container').offset(),
        scale = this.game.renderer.getScaleFactor(),
        width = this.game.renderer.getWidth(),
        height = this.game.renderer.getHeight(),
        mouse = this.game.mouse;

      mouse.x = event.pageX - gamePos.left - (this.isMobile ? 0 : 5 * scale);
      mouse.y = event.pageY - gamePos.top - (this.isMobile ? 0 : 7 * scale);

      if (mouse.x <= 0) {
        mouse.x = 0;
      } else if (mouse.x >= width) {
        mouse.x = width - 1;
      }

      if (mouse.y <= 0) {
        mouse.y = 0;
      } else if (mouse.y >= height) {
        mouse.y = height - 1;
      }
    },

    initBars: function () {
      this.initEquipmentIcons();
      this.initHealthBar();
      this.initXPBar();
      this.initTargetBar();
    },

    initHealthBar: function () {
      var scale = this.game.renderer.getScaleFactor();

      var healthbar = new Healthbar($("#player"), this.game.player, scale);

      this.game.on("HealthChange", function () {
        healthbar.update();
      });
    },

    blinkHealthBar: function () {
      var $hitpoints = $('#player > .hitpoints');

      $hitpoints.addClass('white');
      setTimeout(function () {
        $hitpoints.removeClass('white');
      }, 500)
    },

    initXPBar: function () {
      this.game.on("XPChange", function () {
        var scale = globalGame.renderer.getScaleFactor(),
          XPMaxWidth = $("#xpbar").width() - (12 * scale),
          player = globalGame.player;

        var barWidth = Math.round((XPMaxWidth / player.maxXP) * (player.xp > 0 ? player.xp : 0));
        $("#xpbar").html(player.xp + "/" + player.maxXP);
        $("#xp").css('width', barWidth + "px");
        $("#level").html(player.level);
      });
    },

    initTargetBar: function () {
      var $target = $("#target");

      this.game.on("TargetChange", function () {
        var scale = this.game.renderer.getScaleFactor();
        var target = this.game.player.target;

        if (!target) {
          $target.hide();
          return;
        }

        $target.show();
        var healthbar = new Healthbar($target, target, scale);
        target.on("change", function () {
          healthbar.update();
        });
      }.bind(this));
    },

    toggleButton: function () {
      var name = $('#parchment input').val(),
        $play = $('#createcharacter .play');

      if (name && name.length > 0) {
        $play.removeClass('disabled');
        $('#character').removeClass('disabled');
      } else {
        $play.addClass('disabled');
        $('#character').addClass('disabled');
      }
    },

    hideIntro: function (hidden_callback) {
      clearInterval(this.watchNameInputInterval);
      $('body').removeClass('intro');
      setTimeout(function () {
        $('body').addClass('game');
        hidden_callback();
      }, 1000);
    },

    showChat: function (initial_text) {
      if (this.game.started) {
        $('#chatbox').addClass('active');
        $('#chatinput').val(initial_text || "").focus();
        $('#chatbutton').addClass('active');
      }
    },

    hideChat: function () {
      if (this.game.started) {
        $('#chatbox').removeClass('active');
        $('#chatinput').blur();
        $('#chatbutton').removeClass('active');
      }
    },

    toggleInstructions: function () {
      if ($('#achievements').hasClass('active')) {
        this.toggleAchievements();
        $('#achievementsbutton').removeClass('active');
      }
      $('#instructions').toggleClass('active');
    },

    toggleAchievements: function () {
      if ($('#instructions').hasClass('active')) {
        this.toggleInstructions();
        $('#helpbutton').removeClass('active');
      }
      this.resetPage();
      $('#achievements').toggleClass('active');
    },

    resetPage: function () {
      var $achievements = $('#achievements');

      if ($achievements.hasClass('active')) {
        $achievements.bind(TRANSITIONEND, function () {
          $achievements.removeClass('page' + this.currentPage).addClass('page1');
          this.currentPage = 1;
          $achievements.unbind(TRANSITIONEND);
        }.bind(this));
      }
    },

    toggleInventory: function () {
      if (!$('#inventory').hasClass('active')) {
        this.game.updateInventory();
      }
      $('#inventory').toggleClass('active');
    },

    updateInventory: function () {
      var app = this;
      var scale = this.game.renderer.getScaleFactor();
      var inventory = this.game.player.inventory;
      var $inventory = $("#inventory"),
        $list = $inventory.children("ul");

      $list.html("");
      var items = inventory.toArray();
      for (var slot in items) {
        var item = items[slot];
        var $div = $("<div/>").attr("draggable", true).data("slot", slot).data("item", item).data("source", "inventory");

        $div.on("dragstart", function (e) {
          $(this).css("opacity", 0.4);
          $dragSrc = $(this);
          e.originalEvent.dataTransfer.effectAllowed = 'move';
        }).on("dragend", function (e) {
          $(this).css("opacity", 1);

          // if $dragSrc is still set on the end of the drag,
          // that means that drag failed. (never reached the drop event)
          if ($dragSrc) {
            $dragSrc = null;

            // @TODO: find a way to stop the default "bounce back"
            // drag failed animation

            // @TODO: allow throwing toward another player
            // throw it on the ground
            inventory.throwItem($(this).data("slot").toInt());
            app.updateInventory();
            app.updateSkillbar();
          }
        }).on("mousedown", function (e) {
          if (e.which == 3) { // right mouse button
            var item = $(this).data("item");
            if (item) {
              item.use();
            }
          }
        });

        var $listItem = $("<li/>").append($div);

        $listItem.on("dragover", function (e) {
          if (e.originalEvent.preventDefault) {
            e.originalEvent.preventDefault(); // Necessary. Allows us to drop.
          }

          // See the section on the DataTransfer object.
          e.originalEvent.dataTransfer.dropEffect = 'move';
          return false;
        }).on("dragenter", function (e) {
          $(this).addClass("over");
        }).on("dragleave", function (e) {
          $(this).removeClass("over");
        }).on("drop", function (e) {
          if (e.originalEvent.stopPropagation) {
            // stops the browser from redirecting.
            e.originalEvent.stopPropagation();
          }

          if ($dragSrc.data("source") != "inventory") {
            console.log("Drag and drop denied for source " + $dragSrc.data("source"));
            return false;
          }

          var $currentDiv = $(this).find("div");
          inventory.swap($dragSrc.data("slot").toInt(), $currentDiv.data("slot").toInt());

          $dragSrc = null;
          app.updateInventory();
        });

        if (item) { // might be an empty slot
          if (item.isStackable && item.amount > 0) {
            $div.append($("<span/>").addClass("amount").html(item.amount));
          }
        }

        $list.append($listItem);

        if (item) { // this check is split into two blocks
          // because background-image's from URL
          // MUST be set -after- the element is in the DOM.
          $div.css("background-image", "url('/img/" + scale + "/item-" + Types.getKindAsString(item.kind) + ".png')");
        }
      }
    },

    updateSkillbar: function () {
      var app = this;
      var scale = this.game.renderer.getScaleFactor();
      var skillbar = this.game.player.skillbar;
      var $skillbar = $("#skillbar"),
        $list = $skillbar.children("ul");

      $list.html("");
      var skills = skillbar.toArray();
      for (var slot in skills) {
        var skillSlot = skills[slot];
        var $div = $("<div/>").attr("draggable", true).data("slot", slot).data("source", "skillbar");
        $div.on("dragstart", function (e) {
          $(this).css("opacity", 0.4);
          $dragSrc = $(this);
          e.originalEvent.dataTransfer.effectAllowed = 'move';
        }).on("dragend", function (e) {
          $(this).css("opacity", 1);

          // if $dragSrc is still set on the end of the drag,
          // that means that drag failed. (never reached the drop event)
          if ($dragSrc) {
            $dragSrc = null;

            // @TODO: find a way to stop the default "bounce back"
            // drag failed animation

            // let it "fall" off skillbar
            skillbar.remove($(this).data("slot").toInt());
            app.updateInventory();
            app.updateSkillbar();
          }
        });

        if (skillSlot) {
          $div.data("skill", skillSlot.skill);
          $div.addClass("type-" + Types.getType(skillSlot.skill.kind));
          $div.attr("title", Types.getKindAsString(skillSlot.skill.kind));
          if (skillSlot.skill.isStackable && skillSlot.skill.amount > 0) {
            $div.append($("<span/>").addClass("amount").html(skillSlot.skill.amount));
          }
        }

        var key = skillbar.actualKey(slot.toInt());
        $div.append($("<span/>").addClass("keybind").html(key));

        var $skillSlot = $("<li/>").append($div);
        $skillSlot.on("dragover", function (e) {
          if (e.originalEvent.preventDefault) {
            e.originalEvent.preventDefault(); // Necessary. Allows us to drop.
          }

          // See the section on the DataTransfer object.
          e.originalEvent.dataTransfer.dropEffect = 'move';
          return false;
        }).on("dragenter", function (e) {
          $(this).addClass("over");
        }).on("dragleave", function (e) {
          $(this).removeClass("over");
        }).on("drop", function (e) {
          if (e.originalEvent.stopPropagation) {
            // stops the browser from redirecting.
            e.originalEvent.stopPropagation();
          }

          var $currentDiv = $(this).find("div");
          if ($dragSrc.data("source") == "skillbar") {
            skillbar.swap($currentDiv.data("slot").toInt(), $dragSrc.data("slot").toInt());
          } else if ($dragSrc.data("source") == "inventory") {
            skillbar.set($currentDiv.data("slot").toInt(), $dragSrc.data("item"));
          } else if ($dragSrc.data("source") == "spellbook") {
            skillbar.set($currentDiv.data("slot").toInt(), $currentDiv.data("spell"));
          }

          $dragSrc = null;
          app.updateSkillbar();
        });

        $list.append($skillSlot);

        if (skillSlot) {
          skillSlot.$htmlElement = $skillSlot;
          $div.css("background-image", "url('/img/" + scale + "/" + skillSlot.skill.getSpriteName() + ".png')");
        }
      }
    },

    initEquipmentIcons: function () {
      this.game.on("ArmorChange", function () {
        var scale = globalGame.renderer.getScaleFactor();
        var getIconPath = function (spriteName) {
          return 'img/' + scale + '/item-' + spriteName + '.png';
        };

        var armor = Types.getKindAsString(globalGame.player.armor);
        var armorPath = getIconPath(armor);

        if (armor !== 'firefox') {
          $('#armor').css('background-image', 'url("' + armorPath + '")');
        }
      });

      this.game.on("WeaponChange", function () {
        var scale = globalGame.renderer.getScaleFactor();
        var getIconPath = function (spriteName) {
          return 'img/' + scale + '/item-' + spriteName + '.png';
        };

        var weapon = Types.getKindAsString(globalGame.player.weapon);
        var weaponPath = getIconPath(weapon);
        $('#weapon').css('background-image', 'url("' + weaponPath + '")');
      });
    },

    hideWindows: function () {
      if ($('#achievements').hasClass('active')) {
        this.toggleAchievements();
        $('#achievementsbutton').removeClass('active');
      }
      if ($('#instructions').hasClass('active')) {
        this.toggleInstructions();
        $('#helpbutton').removeClass('active');
      }
      if ($('#inventory').hasClass('active')) {
        this.toggleInventory();
        $('#inventorybutton').removeClass('active');
      }
      if ($('body').hasClass('credits')) {
        this.closeInGameCredits();
      }
      if ($('body').hasClass('about')) {
        this.closeInGameAbout();
      }
    },

    showAchievementNotification: function (id, name) {
      var $notif = $('#achievement-notification'),
        $name = $notif.find('.name'),
        $button = $('#achievementsbutton');

      $notif.removeClass().addClass('active achievement' + id);
      $name.text(name);
      if (this.game.storage.getAchievementCount() === 1) {
        this.blinkInterval = setInterval(function () {
          $button.toggleClass('blink');
        }, 500);
      }
      setTimeout(function () {
        $notif.removeClass('active');
        $button.removeClass('blink');
      }, 5000);
    },

    displayUnlockedAchievement: function (id) {
      var $achievement = $('#achievements li.achievement' + id);

      var achievement = this.game.getAchievementById(id);
      if (achievement && achievement.hidden) {
        this.setAchievementData($achievement, achievement.name, achievement.desc);
      }
      $achievement.addClass('unlocked');
    },

    unlockAchievement: function (id, name) {
      this.showAchievementNotification(id, name);
      this.displayUnlockedAchievement(id);

      var nb = parseInt($('#unlocked-achievements').text());
      $('#unlocked-achievements').text(nb + 1);
    },

    initAchievementList: function (achievements) {
      var app = this;
      var $lists = $('#lists');
      var $page = $('#page-tmpl');
      var $achievement = $('#achievement-tmpl');
      var page = 0;
      var count = 0;
      var $p = null;

      _.each(achievements, function (achievement) {
        count++;

        var $a = $achievement.clone();
        $a.removeAttr('id');
        $a.addClass('achievement' + count);
        if (!achievement.hidden) {
          app.setAchievementData($a, achievement.name, achievement.desc);
        }
        $a.find('.twitter').attr('href', 'http://twitter.com/share?url=http%3A%2F%2Fbrowserquest.mozilla.org&text=I%20unlocked%20the%20%27' + achievement.name + '%27%20achievement%20on%20Mozilla%27s%20%23BrowserQuest%21&related=glecollinet:Creators%20of%20BrowserQuest%2Cwhatthefranck');
        $a.show();
        $a.find('a').click(function () {
          var url = $(this).attr('href');

          app.openPopup('twitter', url);
          return false;
        });

        if ((count - 1) % 4 === 0) {
          page++;
          $p = $page.clone();
          $p.attr('id', 'page' + page);
          $p.show();
          $lists.append($p);
        }
        $p.append($a);
      });

      $('#total-achievements').text($('#achievements').find('li').length);
    },

    initUnlockedAchievements: function (ids) {
      _.each(ids, function (id) {
        this.displayUnlockedAchievement(id);
      }.bind(this));
      $('#unlocked-achievements').text(ids.length);
    },

    setAchievementData: function ($el, name, desc) {
      $el.find('.achievement-name').html(name);
      $el.find('.achievement-description').html(desc);
    },

    toggleCredits: function () {
      var currentState = $('#parchment').attr('class');

      if (this.game.started) {
        $('#parchment').removeClass().addClass('credits');

        $('body').toggleClass('credits');

        if (!this.game.player) {
          $('body').toggleClass('death');
        }
        if ($('body').hasClass('about')) {
          this.closeInGameAbout();
          $('#helpbutton').removeClass('active');
        }
      } else {
        if (currentState !== 'animate') {
          if (currentState === 'credits') {
            this.animateParchment(currentState, this.previousState);
          } else {
            this.animateParchment(currentState, 'credits');
            this.previousState = currentState;
          }
        }
      }
    },

    toggleAbout: function () {
      var currentState = $('#parchment').attr('class');

      if (this.game.started) {
        $('#parchment').removeClass().addClass('about');
        $('body').toggleClass('about');
        if (!this.game.player) {
          $('body').toggleClass('death');
        }
        if ($('body').hasClass('credits')) {
          this.closeInGameCredits();
        }
      } else {
        if (currentState !== 'animate') {
          if (currentState === 'about') {
            if (localStorage && localStorage.data) {
              this.animateParchment(currentState, 'loadcharacter');
            } else {
              this.animateParchment(currentState, 'createcharacter');
            }
          } else {
            this.animateParchment(currentState, 'about');
            this.previousState = currentState;
          }
        }
      }
    },

    closeInGameCredits: function () {
      $('body').removeClass('credits');
      $('#parchment').removeClass('credits');
      if (!this.game.player) {
        $('body').addClass('death');
      }
    },

    closeInGameAbout: function () {
      $('body').removeClass('about');
      $('#parchment').removeClass('about');
      if (!this.game.player) {
        $('body').addClass('death');
      }
      $('#helpbutton').removeClass('active');
    },

    togglePopulationInfo: function () {
      $('#population').toggleClass('visible');
    },

    openPopup: function (type, url) {
      var h = $(window).height(),
        w = $(window).width(),
        popupHeight,
        popupWidth,
        top,
        left;

      switch (type) {
      case 'twitter':
        popupHeight = 450;
        popupWidth = 550;
        break;
      case 'facebook':
        popupHeight = 400;
        popupWidth = 580;
        break;
      }

      top = (h / 2) - (popupHeight / 2);
      left = (w / 2) - (popupWidth / 2);

      newwindow = window.open(url, 'name', 'height=' + popupHeight + ',width=' + popupWidth + ',top=' + top + ',left=' + left);
      if (window.focus) {
        newwindow.focus()
      }
    },

    animateParchment: function (origin, destination) {
      var $parchment = $('#parchment');
      var duration = 1;

      if (this.isMobile) {
        $parchment.removeClass(origin).addClass(destination);
        return;
      }

      if (!this.isParchmentReady) {
        return;
      }

      if (this.isTablet) {
        duration = 0;
      }

      this.isParchmentReady = !this.isParchmentReady;

      $parchment.toggleClass('animate');
      $parchment.removeClass(origin);

      setTimeout(function () {
        $('#parchment').toggleClass('animate');
        $parchment.addClass(destination);
      }.bind(this), duration * 1000);

      setTimeout(function () {
        this.isParchmentReady = !this.isParchmentReady;
      }.bind(this), duration * 1000);
    },

    animateMessages: function () {
      var $messages = $('#notifications div');

      $messages.addClass('top');
    },

    resetMessagesPosition: function () {
      var message = $('#message2').text();

      $('#notifications div').removeClass('top');
      $('#message2').text('');
      $('#message1').text(message);
    },

    showMessage: function (message) {
      var $wrapper = $('#notifications div');
      var $message = $('#notifications #message2');

      this.animateMessages();
      $message.text(message);
      if (this.messageTimer) {
        this.resetMessageTimer();
      }

      this.messageTimer = setTimeout(function () {
        $wrapper.addClass('top');
      }, 5000);
    },

    resetMessageTimer: function () {
      clearTimeout(this.messageTimer);
    },

    resizeUi: function () {
      if (this.game) {
        if (this.game.started) {
          this.game.resize();
          this.initBars();
          this.game.updateBars();
        } else {
          var newScale = this.game.renderer.getScaleFactor();
          this.game.renderer.rescale(newScale);
        }
      }
    },

    loadFromStorage: function (callback) {
      this.game.player.loadFromStorage(callback);
    }
  });

  return App;
});
