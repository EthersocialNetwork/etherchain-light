var express = require('express');
var router = express.Router();
var BigNumber = require('bignumber.js');

var async = require('async');
var Web3 = require('web3');
var redis = require("redis"),
    client = redis.createClient();

router.get('/:offset?', function(req, res, next) {
  var config = req.app.get('config');  
  var web3 = new Web3();
  var Ether     = new BigNumber(10e+17);
  web3.setProvider(config.provider);
  
  client.on("error", function (err) {
    console.log("Error " + err);
  });
 
  async.waterfall([
    function(callback) {
      web3.parity.listAccounts(1000000, req.params.offset, function(err, result) {
        callback(err, result);
      });
    }, function(accounts, callback) {
      
      var data = {};
      
      if (!accounts) {
        return callback({name:"FatDBDisabled", message: "Parity FatDB system is not enabled. Please restart Parity with the --fat-db=on parameter."});
      }
      
      if (accounts.length === 0) {
        return callback({name:"NoAccountsFound", message: "Chain contains no accounts."});
      }
      
      var lastAccount = accounts[accounts.length - 1];
      
      async.eachSeries(accounts, function(account, eachCallback) {
        web3.eth.getCode(account, function(err, code) {
          if (err) {
            return eachCallback(err);
          }
          data[account] = {};
          data[account].address = account;
          data[account].type = code.length > 2 ? "Contract" : "Account";
          
          web3.eth.getBalance(account, function(err, balance) {
            if (err) {
              return eachCallback(err);
            }
            data[account].balance = balance;
            var numBalance = new BigNumber(balance);
            numBalance = numBalance.dividedBy(Ether);
            if(code.length < 3 && numBalance > 0) {
                client.zadd('esn',numBalance,account);
            }
            eachCallback();
          });
        });
      }, function(err) {
        callback(err, data, lastAccount);
      });
    }
  ], function(err, accounts, lastAccount) {
    if (err) {
      return next(err);
    }
    res.render("top100", { accounts: accounts });
  });
});

module.exports = router;
