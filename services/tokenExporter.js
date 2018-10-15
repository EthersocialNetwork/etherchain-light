var async = require('async');
var Web3 = require('web3');
var tokenDatastore = require('nedb-core');

var exporter = function (config, tokenAddress, createBlock) {
  var self = this;
  console.log("[ExportToken]", tokenAddress);
  self.tokenAddress = tokenAddress;
  self.config = config;
  self.db = new tokenDatastore();
  /*
  self.db = new tokenDatastore({
    filename: './token_data_' + tokenAddress + '.db',
    autoload: true
  });
  */
  self.db.ensureIndex({
    fieldName: 'balance'
  }, function (err) {
    if (err) {
      console.log("Error creating balance db index:", err);
    }
  });
  self.db.ensureIndex({
    fieldName: 'timestamp'
  }, function (err) {
    if (err) {
      console.log("Error creating timestamp db index:", err);
    }
  });
  self.db.ensureIndex({
    fieldName: 'args._from'
  }, function (err) {
    if (err) {
      console.log("Error creating _from db index:", err);
    }
  });
  self.db.ensureIndex({
    fieldName: 'args._to'
  }, function (err) {
    if (err) {
      console.log("Error creating _to db index:", err);
    }
  });

  self.web3 = new Web3();
  self.web3.setProvider(config.provideripc);

  self.contract = self.web3.eth.contract(config.erc20ABI).at(tokenAddress);
  //console.log("[Token Init]", tokenAddress);
  self.allEvents = self.contract.allEvents({
    fromBlock: createBlock,
    toBlock: "latest"
  });

  self.contractState = [];
  async.eachSeries(config.erc20ABI, function (item, eachCallback) {
    if (item.type === "function" && item.inputs.length === 0 && item.constant) {
      try {
        self.contract[item.name](function (err, result) {
          if (item.name === "name") {
            self.token_name = result;
          } else if (item.name === "totalSupply") {
            self.token_totalSupply = result;
          } else if (item.name === "decimals") {
            self.token_decimals = result;
          } else if (item.name === "symbol") {
            self.token_symbol = result;
          }
          self.contractState.push({
            name: item.name,
            result: result
          });
          return eachCallback();
        });
      } catch (e) {
        console.log(e);
        return eachCallback();
      }
    } else {
      return eachCallback();
    }
  }, function (err) {
    if (!err) {
      console.log("[TokenInput] [Name]", self.token_name, "\t\t[symbol]", self.token_symbol);
    }
  });
  self.newEvents = self.contract.allEvents();

  // Processes new events
  self.newEvents.watch(function (err, log) {
    if (err) {
      console.log("[Token " + tokenAddress + "] Error receiving new log:", err);
      return;
    }
    console.log("[Token " + tokenAddress + "] New log received:", log);

    self.processLog(log, function (err) {
      console.log("[Token " + tokenAddress + "] New log processed");
    });

    if (log.event === "Transfer") {
      self.exportBalance(log.args._from);
      self.exportBalance(log.args._to);
    }
    if (log.event === "Approval") {
      self.exportBalance(log.args._owner);
      self.exportBalance(log.args._spender);
    }
  });

  // Retrieves historical events and processed them
  self.allEvents.get(function (err, logs) {
    //console.log("Historical events received");
    if (err) {
      console.log("Error receiving historical events:", err);
      return;
    }
    var accounts = {};

    logs.forEach(function (log) {
      if (log.event === "Transfer") {
        accounts[log.args._from] = log.args._from;
        accounts[log.args._to] = log.args._to;
      }

      if (log.event === "Approval") {
        accounts[log.args._owner] = log.args._owner;
        accounts[log.args._spender] = log.args._spender;
      }
    });

    async.eachSeries(logs, self.processLog, function (err) {
      //console.log("All historical logs processed");
      self.exportBatchAccounts(accounts);
    });
  });

  self.exportBatchAccounts = function (accounts) {
    async.eachSeries(accounts, function (item, callback) {
      self.exportBalance(item, callback);
    }, function (err) {
      //console.log("All historical balances updated");
    });
  };

  self.processLog = function (log, callback) {
    if (log.blockNumber && typeof log.blockNumber === 'string' && log.blockNumber.substr(0, 2) === '0x') {
      log.blockNumber = parseInt(log.blockNumber, 16);
    }
    log._id = log.blockNumber + "_" + log.transactionIndex + "_" + log.logIndex;

    //console.log("Exporting log:", log._id);

    //console.dir(log.blockNumber);
    self.web3.eth.getBlock(log.blockNumber, false, function (err, block) {
      if (err) {
        console.log("Error retrieving block information for log:", err);
        callback();
        return;
      }

      log.timestamp = block.timestamp;

      if (log.args && log.args._value) {
        log.args._value = log.args._value.toNumber();
      }

      self.db.insert(log, function (err, newLogs) {
        if (err) {
          if (err.message.indexOf("unique") !== -1) {
            //console.log(log._id, "already exported!");
          } else {
            console.log("Error inserting log:", err);
          }
        }

        callback();
      });
    });
  };

  self.exportBalance = function (address, callback) {
    //console.log("Exporting balance of", address);
    self.contract.balanceOf(address, function (err, balance) {
      var doc = {
        _id: address,
        balance: 0
      };

      if (balance) {
        doc = {
          _id: address,
          balance: balance.toNumber()
        };
      }

      self.db.update({
        _id: doc._id
      }, doc, {
        upsert: true
      }, function (err, numReplaced) {
        if (err) {
          console.log("Error updating balance:", err);
        } else {
          //console.log("Balance export completed");
        }

        if (callback)
          callback();
      });
    });
  };

  //console.log("Exporter initialized, waiting for historical events...");
};

module.exports = exporter;