
function nameFormatter() {
  let configNames = require('../config/configNames.js');
  this.conf = configNames;
  
  this.format = function(address) {
    if (this.conf.names[address]) {
      return this.conf.names[address];
    } else if (this.conf.holdnames[address]) {
      return this.conf.holdnames[address];
    } else {
      return address;
    }
  };
}
module.exports = nameFormatter;