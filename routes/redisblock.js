var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');
const redis = require("redis");
const client = redis.createClient();
const pre_fix = 'explorerBlocks:';
const divide = 10000;

Array.prototype.clean = function (deleteValue) {
  for (var i = 0; i < this.length; i++) {
    if (this[i] == deleteValue) {
      this.splice(i, 1);
      i--;
    }
  }
  return this;
};

router.get('/:end?', function (req, res, next) {
  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.providerSubGESN);
  var data = {};
  data.startTime = new Date();
  data.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  data.dbLastBlock = 0;
  data.blockCount = 1000;

  client.on("error", function (err) {
    console.log("Error " + err);
  });

  async.waterfall([
    function (callback) {
      var rds_key3 = pre_fix.concat("lastblock");
      client.hget(rds_key3, "lastblock", function (err, result) {
        callback(err, result);
      });
    },
    function (dbLastBlock, callback) {
      data.dbLastBlock = Number(dbLastBlock);
      web3.eth.getBlock("latest", false, function (err, result) {
        callback(err, result);
      });
    },
    function (latestBlock, callback) {
      data.lastBlock = new Intl.NumberFormat().format(latestBlock.number);
      if (data.ip == config.cronIP) {
        if (data.dbLastBlock > 0) {
          var tmpblocknumber = data.dbLastBlock + data.blockCount > latestBlock.number ? latestBlock.number : data.dbLastBlock + data.blockCount;
          web3.eth.getBlock(tmpblocknumber, false, function (err, result) {
            callback(err, result);
          });
        } else {
          web3.eth.getBlock(data.blockCount, false, function (err, result) {
            callback(err, result);
          });
        }
      } else if (req.params.end && req.params.end < data.blockCount) {
        web3.eth.getBlock(data.blockCount, false, function (err, result) {
          callback(err, result);
        });
      } else if (req.params.end && req.params.end < latestBlock.number) {
        web3.eth.getBlock(req.params.end, false, function (err, result) {
          callback(err, result);
        });
      } else {
        callback(null, latestBlock);
      }
    },
    function (lastBlock, callback) {
      var batch = web3.createBatch();
      async.times(data.blockCount, function (n, next) {
        var field = lastBlock.number - n;
        if (field === 0) {
          next();
        }
        if (data.dbLastBlock > 0 && data.dbLastBlock > lastBlock.number - n) {
          client.hgetall(pre_fix.concat((field - (field % divide)) + ":").concat(field), function (err, block_info) {
            next(err, block_info);
          });
        } else {
          batch.add(web3.eth.getBlock.request(lastBlock.number - n, false));
          next();
        }
      }, function (err, blocks) {
        if (batch.requests.length > 0) {
          batch.requestManager.sendBatch(batch.requests, function (err, results) {
            async.eachOfSeries(batch.requests, function (value, key, requestsEachCallback) {
              if (results[key].result.number) {
                results[key].result.number = parseInt(results[key].result.number, 16);
              }
              //console.dir(results[key].result);
              blocks.push(results[key].result);
              requestsEachCallback();
            }, function (err) {
              blocks.sort(function (a, b) {
                if (a.number == undefined || b.number == undefined) {
                  return 0;
                }
                return ((a.number > b.number) ? -1 : ((a.number == b.number) ? 0 : 1));
              });
              callback(err, blocks);
            });
          });
        } else {
          callback(err, blocks);
        }
      });
    }
  ], function (err, blocks) {
    if (err || !blocks) {
      console.log("Error " + err);
      next();
    }
    var totalBlockTimes = 0;
    var lastBlockTimes = -1;
    var countBlockTimes = 0;
    var totaDifficulty = 0;
    data.txnumber = 0;
    data.dbBlock = 0;
    maxBlockNumber = 0;

    blocks.clean(undefined);
    blocks.forEach(function (block) {
      if (block && block != undefined) {
        if (lastBlockTimes > 0) {
          totalBlockTimes += lastBlockTimes - Number(block.timestamp);
          totaDifficulty += Number(block.difficulty);
          countBlockTimes++;
        }
        lastBlockTimes = block.timestamp;

        if (data.dbLastBlock > block.number) {
          data.txnumber += Number(block.transactions);
          data.dbBlock++;
        } else {
          data.txnumber += block.transactions ? block.transactions.length : 0;
          if (data.ip == config.cronIP) {
            var rds_value = {
              number: block.number.toString(),
              hash: block.hash,
              parentHash: block.parentHash,
              nonce: block.nonce,
              sha3Uncles: block.sha3Uncles,
              //logsBloom: block.logsBloom,
              transactionsRoot: block.transactionsRoot,
              stateRoot: block.stateRoot,
              miner: block.miner,
              difficulty: block.difficulty.toString(),
              totalDifficulty: block.totalDifficulty.toString(),
              extraData: block.extraData,
              size: block.size.toString(),
              gasLimit: block.gasLimit.toString(),
              gasUsed: block.gasUsed.toString(),
              timestamp: block.timestamp.toString(),
              transactions: block.transactions ? block.transactions.length : 0,
              uncles: block.uncles ? block.uncles.length : 0
            };
            var rds_key = pre_fix.concat("list");
            client.hset(rds_key, block.number, block.miner);
            var rds_key2 = pre_fix.concat((block.number - (block.number % divide)) + ":").concat(block.number);
            client.hmset(rds_key2, rds_value);
            maxBlockNumber = maxBlockNumber < block.number ? block.number : maxBlockNumber;
            var rds_key3 = pre_fix.concat("lastblock");
            client.hset(rds_key3, "lastblock", maxBlockNumber);
          }
        }
      }
    });

    data.blockTime = new Intl.NumberFormat().format((totalBlockTimes / countBlockTimes).toFixed(4)) + "s";
    data.difficulty = hashFormat(totaDifficulty / countBlockTimes) + "H";
    data.hashrate = hashFormat(totaDifficulty / totalBlockTimes) + "H/s";

    //console.dir(blocks[0]);
    //console.dir(blocks[blocks.length - 1]);
    //console.log("blocks.length: ", blocks.length);
    if (blocks[0] === undefined || blocks[0] === null) {
      data.startblockntime = "Genesis block";
    } else {
      data.startblockntime = Number(blocks[0].number).toLocaleString() + " block (" + new Date(blocks[0].timestamp * 1000) + ")";
    }
    data.endblockntime = Number(blocks[blocks.length - 1].number).toLocaleString() + " block (" + new Date(blocks[blocks.length - 1].timestamp * 1000) + ")";
    data.endTime = new Date();
    data.consumptionTime = ((data.endTime - data.startTime) / 1000).toLocaleString(undefined, {
      maximumFractionDigits: 4
    }) + " s";
    if (data.ip == config.cronIP) {
      res.json(resultToJson(null, data));
    } else {
      res.render('redisblock', {
        startTime: data.startTime,
        PerBlock: data.blockCount.toLocaleString(),
        lastBlock: data.lastBlock,
        blockTime: data.blockTime,
        difficulty: data.difficulty,
        hashrate: data.hashrate,
        startblock: data.startblockntime,
        endblock: data.endblockntime,
        endTime: data.endTime,
        consumptionTime: data.consumptionTime,
        transactionsCount: data.txnumber.toLocaleString(),
        FoundBlockInDB: data.dbBlock.toLocaleString(),
        LastBlockInDB: data.dbLastBlock.toLocaleString(),
        nowBlockNumber: blocks[0] === undefined ? 0 : blocks[0].number
      });
    }
  });
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

function hashFormat(number) {
  if (number > 1000000000000000) {
    return new Intl.NumberFormat().format((number / 1000000000000000).toFixed(4)) + "P";
  } else if (number > 1000000000000) {
    return new Intl.NumberFormat().format((number / 1000000000000).toFixed(4)) + "T";
  } else if (number > 1000000000) {
    return new Intl.NumberFormat().format((number / 1000000000).toFixed(4)) + "G";
  } else if (number > 1000000) {
    return new Intl.NumberFormat().format((number / 1000000).toFixed(4)) + "M";
  } else if (number > 1000) {
    return new Intl.NumberFormat().format((number / 1000).toFixed(4)) + "K";
  } else {
    return new Intl.NumberFormat().format((number).toFixed(4));
  }
}

module.exports = router;