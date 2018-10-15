var BigNumber = require('bignumber.js');

var Ether     = new BigNumber(10e+17);

function tokenFormatter(config) {
  self = this;
  self.config = config;
  
  self.format = function(amount) {
    var ret = new BigNumber(amount.toString());
    //console.dir("amount:  " + amount);
    //console.dir("toFormat:" +ret.dividedBy(Ether).toFormat(8));
    //var divisor = (new BigNumber(10)).toPower(self.config.tokenDecimals);
    return ret.dividedBy(Ether).toFormat(8) + " " + self.config.tokenShortName;
  };
}

module.exports = tokenFormatter;