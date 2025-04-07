// HashMap.js
class HashMap {
    constructor() {
      this.map = {};
    }

    add(id, obj) {
      //logger.debug("HashMap = Adding item to HashMap [" + id + "] with value [" + JSON.stringify(obj) + "]");
      logger.debug("HashMap = Adding item to HashMap [" + id + "]");
      this.map[id] = obj;
    }

    get(id,startsWith) {
      

      if(startsWith==true)
      {
        
          logger.debug("HashMap = Getting Item starting with [" + id + "]");

          // Find a key that starts with the search term
          const foundKey = Object.keys(this.map).find(key => key.startsWith(id));
    
          if (foundKey) {
            logger.debug("HashMap = Found key starting with [" + id + "]: [" + foundKey + "]");
            return this.map[foundKey];
          }
    
          return undefined; // Return undefined if no match is found
        
      }
      else {
        logger.debug("HashMap = Getting Item Matching [" + id + "]");
        return this.map[id];
      } 
    }


    remove(id) {
      delete this.map[id];
    }

    has(id) {
      return this.map.hasOwnProperty(id);
    }

    keys() {
      return Object.keys(this.map);
    }

    contains(searchValue) {
      var item = this.get(searchValue);
      if(item!==undefined && item !== null)return true;
      return false;
    }

    size() {
      return Object.keys(this.map).length;
    }
  }

  module.exports = HashMap;
