var express = require('express');
var router = express.Router();
var async = require('async');
var Web3 = require('web3');
var web3 = new Web3();
var BigNumber = require('bignumber.js');
var redis = require("redis"),
  client = redis.createClient();

var provider = new web3.providers.HttpProvider("http://127.0.0.1:8545");
web3.setProvider(provider);

function resultToJson(err, param) {
  var result = {};
  result.jsonrpc = '2.0';

  if (err) {
    result.result = err;
    result.success = false;
  } else if (param) {
    result.result = param;
    result.success = true;
  } else {
    result.result = NaN;
    result.success = false;
  }
  return result;
}

//http://explorer.ethersocial.info/api_account/tokenbalance/0x3e2c6a622c29cf30c04c9ed8ed1e985da8c95662/0x0146b9dcd9fb2abc1b5b136c28d20d0037526961
router.get('/tokenbalance/:address/:contractaddress?', function (req, res, next) {
  var tokenExporter = req.app.get('tokenExporter');
  client.on("error", function (err) {
    console.log("Redis Error " + err);
  });

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
              tmpTokeninfo.account = req.params.address;
              tmpTokeninfo.contractaddress = req.params.contractaddress;
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
        console.log("Error " + err);
        res.json(resultToJson(null, null));
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
                  tmpTokeninfo.account = req.params.address;
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
        console.log("Error " + err);
        res.json(resultToJson(null, null));
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