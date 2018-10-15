var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');
var redis = require("redis"),
  client = redis.createClient();
var RLP = require('rlp');

/* modified baToJSON() routine from rlp */
function baToString(ba) {
  if (Buffer.isBuffer(ba)) {
    return ba.toString('ascii');
  } else if (ba instanceof Array) {
    var array = [];
    for (var i = 0; i < ba.length; i++) {
      array.push(baToString(ba[i]));
    }
    return array.join('/');
  } else {
    return ba;
  }
}

var hex2ascii = function (hexIn) {
  var hex = hexIn.toString();
  var str = '';
  try {
    var ba = RLP.decode(hex);
    var test = ba[1].toString('ascii');
    if (test == 'geth' || test == 'Parity') {
      // FIXME
      ba[0] = ba[0].toString('hex');
    }
    str = baToString(ba);
  } catch (e) {
    for (var i = 0; i < hex.length; i += 2) {
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
  }
  return str;
};

router.get('/:block', function (req, res, next) {
  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.provider);
  var web3GESN = new Web3();
  web3GESN.setProvider(config.providerSubGESN);

  var tokenExporter = req.app.get('tokenExporter');
  client.on("error", function (err) {
    console.log("Redis Error " + err);
  });

  async.waterfall([
    function (callback) {
      web3GESN.eth.getBlock(req.params.block, true, function (err, result) {
        callback(err, result);
      });
    },
    function (result, callback) {
      if (!result) {
        return callback({
          name: "BlockNotFoundError",
          message: "Block not found!"
        }, null, null);
      }
      web3.trace.block(result.number, function (err, traces) {
        callback(err, result, traces);
      });
    },
    function (block, traces, callback) {
      client.hgetall('esn_contracts:transfercount', function (err, replies) {
        callback(null, block, traces, replies);
      });

    },
    function (block, traces, result, callback) {
      var accountList = [];
      if (result) {
        async.eachOfSeries(result, function (value, key, eachOfSeriesCallback) {
          if (value > 0) {
            accountList.push(key);
          }
          eachOfSeriesCallback();
        }, function (err) {
          if (err) {
            console.log("[ERROR]block: ", err);
          }
          callback(null, block, traces, accountList);
        });
      } else {
        callback(null, block, traces, null);
      }
    },
    function (block, traces, accountList, callback) {
      if (accountList && accountList.length > 0) {
        var tokenEvents = [];
        async.eachSeries(accountList, function (account, accountListeachCallback) {
          //TokenDB Start
          async.waterfall([
            function (tokenlistcallback) {
              var allEvents = tokenExporter[account].contract.allEvents({
                fromBlock: block.number,
                toBlock: block.number
              });
              allEvents.get(function (err, events) {
                if (err) {
                  console.log("Error receiving historical events:", err);
                  tokenlistcallback(err, null);
                } else {
                  tokenlistcallback(null, events);
                }
              });
            }
          ], function (err, events) {
            if (err) {
              console.log("Error " + err);
            } else {
              async.eachSeries(events, function (event, eventsEachCallback) {
                tokenEvents.push(event);
                eventsEachCallback();
              });
            }
            accountListeachCallback();
          });
          //TokenDB End
        }, function (err) {
          callback(err, tokenEvents, block, traces);
        });
      } else {
        callback(null, null, block, traces);
      }
    }
  ], function (err, tokenEvents, block, traces) {
    if (err) {
      console.log("Error " + err);
    }

    if (block && block.transactions) {
      block.transactions.forEach(function (tx) {
        tx.traces = [];
        tx.failed = false;
        if (traces != null) {
          traces.forEach(function (trace) {
            if (tx.hash === trace.transactionHash) {
              if (tokenEvents) {
                tokenEvents.forEach(function (event) {
                  if (trace.transactionHash === event.transactionHash) {
                    if (event.event === "Transfer" || event.event === "Approval") {
                      if (event.args && event.args._value && trace.transactionPosition == event.transactionIndex) {
                        trace._value = "0x".concat(event.args._value.toNumber().toString(16));
                        trace._from = event.args._from;
                        trace._to = event.args._to;
                        trace._event = event.event;
                        trace._decimals = tokenExporter[trace.action.to].token_decimals;
                        trace._symbol = tokenExporter[trace.action.to].token_symbol;
                        trace._name = tokenExporter[trace.action.to].token_name;
                        trace.isinTransfer = true;
                      }
                    }
                  }
                });
              }
              tx.traces.push(trace);
              if (trace.error) {
                tx.failed = true;
                tx.error = trace.error;
              }
            }
          });
        }
      });
    }
    if (block && block.extraData) {
      block.extraDataToAscii = hex2ascii(block.extraData);
    }

    if (!block || !block.number) {
      return next({
        name: "BlockNotFoundError",
        message: "Block not found!"
      });
    }

    //console.dir(block);
    res.render('block', {
      block: block
    });
  });

});

router.get('/uncle/:hash/:number', function (req, res, next) {

  var config = req.app.get('config');
  var web3GESN = new Web3();
  web3GESN.setProvider(config.providerSubGESN);

  async.waterfall([
    function (callback) {
      web3GESN.eth.getUncle(req.params.hash, req.params.number, true, function (err, result) {
        callback(err, result);
      });
    },
    function (result, callback) {
      if (!result) {
        return next({
          name: "UncleNotFoundError",
          message: "Uncle not found!"
        });
      }
      callback(null, result);
    }
  ], function (err, uncle) {
    if (err) {
      console.log("Error " + err);
    }

    //console.log(uncle);

    res.render('uncle', {
      uncle: uncle,
      blockHash: req.params.hash
    });
  });

});

module.exports = router;