var async = require('async');
var Web3 = require('web3');
const redis = require("redis");
const pre_fix = 'explorerBlocks:';
const divide = 10000;
var client = redis.createClient();
client.on("error", function (err) {
	console.log("Error " + err);
});

function getRedis() {
	if (client && client.connected) {
		return client;
	}

	if (client) {
		client.end(); // End and open once more
	}

	client = redis.createClient();
	client.on("error", function (err) {
		console.log("Error " + err);
	});
	return client;
}

var blockstore = function (config) {
	async.forever(
		function (next) {
			console.log("[▷▷▷ Start ▷▷▷][blockStoreService]", printDateTime());
			var web3 = new Web3();
			web3.setProvider(config.providerIpc);
			var data = {};
			data.dbLastBlock = 0;
			data.blockCount = 1000;

			async.waterfall([
				function (callback) {
					var rds_key3 = pre_fix.concat("lastblock");
					getRedis().hget(rds_key3, "lastblock", function (err, result) {
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
				},
				function (lastBlock, callback) {
					var cntTimes = lastBlock.number - data.dbLastBlock;
					if (cntTimes > data.blockCount) {
						cntTimes = data.blockCount;
					}
					var batch = web3.createBatch();
					async.times(cntTimes, function (n, next) {
						var field = lastBlock.number - n;
						if (field === 0) {
							next();
						} else {
							if (data.dbLastBlock > 0 && data.dbLastBlock > lastBlock.number - n) {
								next();
							} else {
								batch.add(web3.eth.getBlock.request(lastBlock.number - n, false));
								next();
							}
						}
					}, function (err, blocks) {
						if (batch.requests.length > 0) {
							batch.requestManager.sendBatch(batch.requests, function (err, results) {
								async.eachOfSeries(batch.requests, function (value, key, requestsEachCallback) {
									if (results[key].result.number) {
										results[key].result.number = parseInt(results[key].result.number, 16);
									}
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
				} else {
					var maxBlockNumber = 0;
					for (var i = 0; i < blocks.length; i++) {
						if (blocks[i] == null || blocks[i] == undefined || typeof blocks[i] === undefined) {
							blocks.splice(i, 1);
							i--;
						}
					}
					blocks.forEach(function (block) {
						if (block && block != undefined) {
							if (data.dbLastBlock <= block.number) {
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
								getRedis().hset(rds_key, block.number, block.miner);
								var rds_key2 = pre_fix.concat((block.number - (block.number % divide)) + ":").concat(block.number);
								getRedis().hmset(rds_key2, rds_value);
								maxBlockNumber = maxBlockNumber < block.number ? block.number : maxBlockNumber;
								var rds_key3 = pre_fix.concat("lastblock");
								getRedis().hset(rds_key3, "lastblock", maxBlockNumber);
							}
						}
					});
				}
				console.log("[□□□□ End □□□□][blockStoreService]", printDateTime());
				setTimeout(function () {
					next();
				}, config.blockStoreServiceInterval);
			});
		},
		function (err) {
			console.log('!!!! blockStoreService STOP !!!!', err);
		}
	);
};

module.exports = blockstore;

function addZeros(num, digit) {
	var zero = '';
	num = num.toString();
	if (num.length < digit) {
		for (i = 0; i < digit - num.length; i++) {
			zero += '0';
		}
	}
	return zero + num.toString();
}

function printDateTime() {
	var currentDate = new Date();
	var calendar = currentDate.getFullYear() + "-" + addZeros((currentDate.getMonth() + 1).toString(), 2) + "-" + addZeros(currentDate.getDate().toString(), 2);
	var currentHours = addZeros(currentDate.getHours(), 2);
	var currentMinute = addZeros(currentDate.getMinutes(), 2);
	var currentSeconds = addZeros(currentDate.getSeconds(), 2);
	return calendar + " " + currentHours + ":" + currentMinute + ":" + currentSeconds;
}