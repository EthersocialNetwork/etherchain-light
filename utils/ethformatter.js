var BigNumber = require('bignumber.js');

var Ether     = new BigNumber(10e+17);

function formatAmount(amount) {
  var ret = new BigNumber(amount.toString());
  
  return ret.dividedBy(Ether).toFormat(6) + " ESN";
}
module.exports = formatAmount;
