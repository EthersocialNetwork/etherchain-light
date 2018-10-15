var BigNumber = require('bignumber.js');

function tokenFormatter() {
  self = this;
  
  self.format = function(amount, decimals, symbol) {
    var Ether     = new BigNumber(Math.pow(10, decimals));
    var ret = new BigNumber(amount.toString());
    return ret.dividedBy(Ether).toFormat(8) + " " + symbol;
  };
}

module.exports = tokenFormatter;