
var cls = require("./lib/class"),
    Messages = require('./message'),
    DBEntity = require('./db-entity'),
    Utils = require('./utils');

module.exports = Entity = DBEntity.extend({
    init: function(id, type, kind, x, y) {
        this._super(); 

        Utils.Mixin(this.data, {
            name: "unknown",
            x: x,
            y: y
        });

        this.id = parseInt(id);
        this.type = type;
        this.kind = kind;
    },

    get x() {
        return this.data.x;
    },

    get y() {
        return this.data.y;
    },

    set x(x) {
        this.data.x = x;
        this.isDirty = true;
    },

    set y(y) {
        this.data.y = y;
        this.isDirty = true;
    },
    
    destroy: function() {

    },
    
    getState: function() {
        return [
            parseInt(this.id),
            this.kind,
            this.x,
            this.y
        ];
    },
    
    spawn: function() {
        return new Messages.Spawn(this);
    },
    
    despawn: function() {
        return new Messages.Despawn(this.id);
    },
    
    setPosition: function(x, y) {
        this.x = x;
        this.y = y;
    },
    
    getPositionNextTo: function(entity) {
        var pos = null;
        if(entity) {
            pos = {};
            // This is a quick & dirty way to give mobs a random position
            // close to another entity.
            var r = Utils.random(4);
            
            pos.x = entity.x;
            pos.y = entity.y;
            if(r === 0)
                pos.y -= 1;
            if(r === 1)
                pos.y += 1;
            if(r === 2)
                pos.x -= 1;
            if(r === 3)
                pos.x += 1;
        }
        return pos;
    },
    
    setName: function(name) {
        this.data.name = name;
        this.save();
    },

    getName: function() {
        return this.data.name;
    },

    loadFromDB: function() {
        if (!this.dbEntity) return;

        this._super();
    },

    save: function(callback) {
        if (!this.dbEntity) return; 
        
        this._super(callback);
    }
});
