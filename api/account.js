var express = require('express');
var router = express.Router();
var async = require('async');
var Web3 = require('web3');
var web3 = new Web3();
var BigNumber = require('bignumber.js');
var redis = require("redis"),
  client = redis.createClient();
client.on("error", function (err) {
  console.log("Redis Error ", err);
});

function resultToJson(err, param) {
  var result = {};
  result.jsonrpc = 'esn';
  result.success = false;

  if (err) {
    result.result = err;
  } else if (param) {
    result.result = param;
    result.success = true;
  } else {
    result.result = NaN;
  }
  return result;
}

Object.size = function (obj) {
  var size = 0,
    key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) size++;
  }
  return size;
};

//http://explorer.ethersocial.info/api_account/txlist/0x5811590907050746b897efe65fea7b65710e1a2c/0/9999999
router.get('/txlist/:address/:startblock?/:endblock?', function (req, res, next) {
  var address = req.params.address;
  var startblock = req.params.startblock;
  var endblock = req.params.endblock;
  var max_count = 1000;
  var options = {
    fromBlock: startblock,
    toBlock: endblock,
    address: address,
  };

  if (!web3.currentProvider)
    web3.setProvider(new web3.providers.HttpProvider(req.app.get('config').localRPCaddress));

  async.waterfall([
      function (callback) {
        web3.eth.getBlock("latest", false, function (err, result) {
          callback(err, result); //마지막 블럭 정보를 받아서 전달
        });
      },
      function (lastblock, callback) {
        if (endblock > lastblock.number) {
          options.toBlock = lastblock.number;
        }
        if (startblock < 1) {
          options.fromBlock = 1;
        }

        web3.eth.getStorageAt(address, 0, function (err, result) {
          callback(err, result);
        });
      },
      function (position, callback) {
        options.topics = [position];
        var filter = web3.eth.filter(options);
        console.dir(filter);
        console.log("=================== filter ===================");
        filter.get(function (err, result) {
          callback(err, result);
        });
      }
    ],
    function (err, filterGet) {
      console.dir(err);
      console.log("=================== err ===================");
      console.dir(filterGet);
      console.log("=================== filterGet ===================");
      if (!err && filterGet) {
        res.json(resultToJson(null, filterGet));
      } else {
        res.json(resultToJson(err, null));
      }
    });
});

//http://explorer.ethersocial.info/api_account/esnsupply
router.get('/esnsupply', function (req, res, next) {
  /*
  client.hset('esn_top100:apisupport', 'totalAccounts', totalAccounts);
  client.hset('esn_top100:apisupport', 'activeAccounts', activeAccounts);
  client.hset('esn_top100:apisupport', 'totalSupply', totalSupply);
  */
  async.waterfall([
      function (callback) {
        client.hget('esn_top100:apisupport', 'totalAccounts', function (err, result) {
          return callback(err, result);
        });
      },
      function (totalAccounts, callback) {
        client.hget('esn_top100:apisupport', 'activeAccounts', function (err, result) {
          return callback(err, totalAccounts, result);
        });
      },
      function (totalAccounts, activeAccounts, callback) {
        client.hget('esn_top100:apisupport', 'totalSupply', function (err, result) {
          return callback(err, totalAccounts, activeAccounts, result);
        });
      }
    ],
    function (err, totalAccounts, activeAccounts, totalSupply) {
      if (err) {
        res.json(resultToJson(err, null));
      } else {
        var supplyinfo = {};
        supplyinfo.totalAccounts = totalAccounts;
        supplyinfo.activeAccounts = activeAccounts;
        supplyinfo.totalSupply = totalSupply;

        res.json(resultToJson(null, supplyinfo));
      }
    });
});

//http://explorer.ethersocial.info/api_account/tokenevents/0x3e2c6a622c29cf30c04c9ed8ed1e985da8c95662/0x0146b9dcd9fb2abc1b5b136c28d20d0037526961/10/1
router.get('/tokenevents/:address/:contractaddress/:count?/:page?', function (req, res, next) {
  var tokenExporter = req.app.get('tokenExporter');
  var address = req.params.address;
  var contractaddress = req.params.contractaddress;
  var count = req.params.count ? parseInt(req.params.count, 10) : 10;
  var page = req.params.page ? parseInt(req.params.page, 10) : 1;

  if (contractaddress && tokenExporter[contractaddress]) {
    async.waterfall([
      function (tokencallback) {
        tokenExporter[contractaddress].db.find({
          _id: address
        }).exec(function (err, balance) {
          if (err) {
            console.log("[tokendb.find]", err);
            tokencallback(err, null);
          } else {
            if (balance.length !== 0 && balance[0]._id) {
              tokenExporter[contractaddress].db.find({
                $or: [{
                  "args._from": address
                }, {
                  "args._to": address
                }]
              }).sort({
                timestamp: -1
              }).skip((page - 1) * count).limit(count).exec(function (err, events) {
                var tokeninfo = {};
                if (balance.length !== 0 && balance[0]._id && balance[0].balance) {
                  //tokeninfo.account = account;
                  tokeninfo.balance = (new BigNumber(balance[0].balance)).toString(10);
                }
                tokeninfo.events = events;
                tokeninfo.name = tokenExporter[contractaddress].token_name;
                tokeninfo.decimals = tokenExporter[contractaddress].token_decimals;
                tokeninfo.symbol = tokenExporter[contractaddress].token_symbol;
                tokeninfo.totalSupply = tokenExporter[contractaddress].token_totalSupply ? (new BigNumber(tokenExporter[contractaddress].token_totalSupply)).toString(10) : "NaN";
                tokencallback(err, tokeninfo);
              });
            } else {
              tokencallback(null, null);
            }
          }
        });
      },
      function (tokeninfo, tokencallback) {
        async.eachSeries(tokeninfo.events, function (event, eventEachCallback) {
          if (event.args && event.args._value) {
            event.args._value = (new BigNumber(event.args._value)).toString(10);
          }
          eventEachCallback();
        }, function (err) {
          tokencallback(err, tokeninfo);
        });
      }
    ], function (err, tokeninfo) {
      if (err) {
        console.log("Error ", err);
        res.json(resultToJson(err, null));
      } else {
        res.json(resultToJson(null, tokeninfo));
      }
    });
  } else {
    res.json(resultToJson(null, null));
  }
});

//http://explorer.ethersocial.info/api_account/tokeninfo/0x0146b9dcd9fb2abc1b5b136c28d20d0037526961
router.get('/tokeninfo/:contractaddress', function (req, res, next) {
  var tokenExporter = req.app.get('tokenExporter');

  if (req.params.contractaddress && tokenExporter[req.params.contractaddress]) {
    var tokeninfo = {};
    tokeninfo.name = tokenExporter[req.params.contractaddress].token_name;
    tokeninfo.decimals = tokenExporter[req.params.contractaddress].token_decimals;
    tokeninfo.symbol = tokenExporter[req.params.contractaddress].token_symbol;
    tokeninfo.totalSupply = tokenExporter[req.params.contractaddress].token_totalSupply ? (new BigNumber(tokenExporter[req.params.contractaddress].token_totalSupply)).toString(10) : "NaN";
    res.json(resultToJson(null, tokeninfo));
  } else {
    res.json(resultToJson(null, null));
  }
});

//http://explorer.ethersocial.info/api_account/tokenbalance/0x3e2c6a622c29cf30c04c9ed8ed1e985da8c95662/0x0146b9dcd9fb2abc1b5b136c28d20d0037526961
router.get('/tokenbalance/:address/:contractaddress?', function (req, res, next) {
  var tokenExporter = req.app.get('tokenExporter');

  if (tokenExporter[req.params.address] || (req.params.contractaddress && !tokenExporter[req.params.contractaddress])) {
    res.json(resultToJson(null, null));
  } else if (req.params.contractaddress && tokenExporter[req.params.contractaddress]) {
    async.waterfall([
      function (tokencallback) {
        tokenExporter[req.params.contractaddress].db.find({
          _id: req.params.address
        }).exec(function (err, balance) {
          if (err) {
            console.log("[tokendb.find]", err);
            tokencallback(null, null);
          } else {
            if (balance.length !== 0 && balance[0]._id && balance[0].balance) {
              var tmpTokeninfo = {};
              //tmpTokeninfo.account = req.params.address;
              //tmpTokeninfo.contractaddress = req.params.contractaddress;
              tmpTokeninfo.balance = (new BigNumber(balance[0].balance)).toString(10);
              tmpTokeninfo.name = tokenExporter[req.params.contractaddress].token_name;
              tmpTokeninfo.decimals = tokenExporter[req.params.contractaddress].token_decimals;
              tmpTokeninfo.symbol = tokenExporter[req.params.contractaddress].token_symbol;
              tokencallback(null, tmpTokeninfo);
            } else {
              tokencallback(null, null);
            }
          }
        });
      }
    ], function (err, tokeninfo) {
      if (err) {
        console.log("Error ", err);
        res.json(resultToJson(err, null));
      } else {
        if (tokeninfo && tokeninfo.balance && tokeninfo.balance >= 0) {
          res.json(resultToJson(null, tokeninfo));
        } else {
          res.json(resultToJson(null, null));
        }
      }
    });
  } else if (req.params.address && !tokenExporter[req.params.address] && !req.params.contractaddress) {
    var contractAddressList = [];
    async.waterfall([
      function (tokencallback) {
        client.hgetall('esn_contracts:transfercount', function (err, replies) {
          tokencallback(err, replies);
        });
      },
      function (result, tokencallback) {
        if (result) {
          async.eachOfSeries(result, function (value, key, eachOfSeriesCallback) {
            if (value > 0) {
              contractAddressList.push(key);
            }
            eachOfSeriesCallback();
          }, function (err) {
            if (err) {
              console.log("[ERROR] exporter1: ", err);
            }
            tokencallback(null, contractAddressList);
          });
        } else {
          tokencallback(null, null);
        }
      },
      function (contractAddressList, tokencallback) {
        if (contractAddressList.length > 0) {
          var tokenList = [];
          async.eachSeries(contractAddressList, function (contractaddress, accountListeachCallback) {
            tokenExporter[contractaddress].db.find({
              _id: req.params.address
            }).exec(function (err, balance) {
              if (err) {
                console.log("[tokendb.find]", err);
                accountListeachCallback();
              } else {
                if (balance.length !== 0 && balance[0]._id && balance[0].balance) {
                  var tmpTokeninfo = {};
                  //tmpTokeninfo.account = req.params.address;
                  tmpTokeninfo.contractaddress = contractaddress;
                  tmpTokeninfo.balance = (new BigNumber(balance[0].balance)).toString(10);
                  tmpTokeninfo.name = tokenExporter[contractaddress].token_name;
                  tmpTokeninfo.decimals = tokenExporter[contractaddress].token_decimals;
                  tmpTokeninfo.symbol = tokenExporter[contractaddress].token_symbol;
                  tokenList.push(tmpTokeninfo);
                  return accountListeachCallback();
                } else {
                  accountListeachCallback();
                }
              }
            });
          }, function (err) {
            tokencallback(err, tokenList);
          });
        }
      }
    ], function (err, tokenList) {
      if (err) {
        console.log("Error ", err);
        res.json(resultToJson(err, null));
      } else {
        if (tokenList && tokenList.length > 0) {
          res.json(resultToJson(null, tokenList));
        } else {
          res.json(resultToJson(null, null));
        }
      }
    });
  } else {
    res.json(resultToJson(null, null));
  }
});

//http://explorer.ethersocial.info/api_account/eth_balancemulti/0x5811590907050746b897efe65fea7b65710e1a2c,0xe3ec5ebd3e822c972d802a0ee4e0ec080b8237ba/1522934
router.get('/eth_balancemulti/:addresses/:tag?', function (req, res, next) {
  if (!web3.currentProvider)
    web3.setProvider(new web3.providers.HttpProvider(req.app.get('config').localRPCaddress));

  async.waterfall([
    function (callback) {
      var split_res = req.params.addresses.split(",");
      callback(null, split_res);
    },
    function (accounts, callback) { //balance batch 시작
      var batch = web3.createBatch();
      async.eachSeries(accounts, function (account, batchAddEachCallback) {
        batch.add(web3.eth.getBalance.request(account, req.params.tag));
        batchAddEachCallback();
      }, function (err) {
        callback(err, batch);
      });
    },
    function (batchAdded, callback) {
      batchAdded.requestManager.sendBatch(batchAdded.requests, function (err, results) {
        if (err) {
          callback(err, null);
        } else {
          callback(null, batchAdded.requests, results);
        }
      });
    },
    function (requests, balances, callback) {
      var arrResult = [];
      async.eachOfSeries(requests, function (value, key, requestsEachCallback) {
        var data = {};
        data.account = value.params[0];
        data.balance = (new BigNumber(balances[key].result)).toString(10);
        arrResult.push(data);
        requestsEachCallback();
      }, function (err) {
        if (err) {
          console.log("[ERROR] batchResults: ", err);
        }
        callback(null, arrResult);
      });
    }, //balance batch 종료

  ], function (err, result) {
    res.json(resultToJson(err, result));
  });
});

module.exports = router;