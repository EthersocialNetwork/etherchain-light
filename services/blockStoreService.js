var async = require('async');
var Web3 = require('web3');

const divide = 10000;
var BigNumber = require('bignumber.js');
BigNumber.config({
	DECIMAL_PLACES: 8
});

const pre_fix = 'explorerBlocks:';
const pre_fix_tx = 'explorerTransactions:';
const pre_fix_account_tx = 'explorerAccountTx:';
const configConstant = require('../config/configConstant');
var Redis = require('ioredis');
var redis = new Redis(configConstant.redisConnectString);

var blockstore = function (app) {
	var tokenExporter = app.get('tokenExporter');

	async.forever(
		function (next) {
			//console.log("[▷▷▷ Start ▷▷▷][blockStoreService]", printDateTime());
			var web3 = new Web3();
			web3.setProvider(new web3.providers.HttpProvider(configConstant.localRPCaddress));
			var data = {};
			data.dbLastBlock = 0;
			data.blockCount = 2000;
			var maxBlockNumber = 0;

			async.waterfall([
				function (callback) {
					var rds_key3 = pre_fix.concat("lastblock");
					redis.hget(rds_key3, "lastblock", function (err, result) {
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
								batch.add(web3.eth.getBlock.request(lastBlock.number - n, true));
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
				},
				function (blocks, callback) {
					if (blocks && blocks.length > 0) {
						for (var i = 0; i < blocks.length; i++) {
							if (blocks[i] == null || blocks[i] == undefined || typeof blocks[i] === undefined) {
								blocks.splice(i, 1);
								i--;
							}
						}
						async.eachSeries(blocks, function (block, eachInCallback) {
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
										totalDifficulty: block.timestamp ? block.timestamp.toString() : 0,
										extraData: block.extraData,
										size: block.size.toString(),
										gasLimit: block.gasLimit.toString(),
										gasUsed: block.gasUsed.toString(),
										timestamp: block.timestamp.toString(),
										transactions: block.transactions ? block.transactions.length : 0,
										uncles: block.uncles ? block.uncles.length : 0
									};

									var rds_key = pre_fix.concat("list");
									redis.zadd(rds_key, block.number, block.hash);
									var rds_key2 = pre_fix.concat((block.number - (block.number % divide)) + ":").concat(block.number);
									redis.hmset(rds_key2, rds_value);
									maxBlockNumber = maxBlockNumber < block.number ? block.number : maxBlockNumber;
									var rds_key3 = pre_fix.concat("lastblock");
									redis.hset(rds_key3, "lastblock", maxBlockNumber);

									if (block.transactions && block.transactions.length > 0) {
										async.waterfall([
												function (incallback) {
													web3.trace.filter({
														"fromBlock": web3.toHex((new BigNumber(block.number)).toNumber()),
														"toBlock": web3.toHex((new BigNumber(block.number)).toNumber())
													}, function (err, traces) {
														if (err) {
															console.log("[ERROR][web3.trace.filter] ", block.number);
															console.log(err);
														}
														//traces[key].calltype = "to"; //account.js에서 처리해야함
														incallback(err, traces);
													});
												},
												function (traces, incallback) {
													async.eachSeries(traces, function (trace, ineachCallback) {
														trace.isContract = false;
														if (!trace.action) {
															trace.action = {};
														}
														trace.action._value = '';
														trace.action._to = '';
														if (trace.type === 'reward') {
															if (trace.action.value && web3.toHex((new BigNumber(trace.action.value)).toNumber()) == '0x4563918244f40000') {
																var gasUsed = new BigNumber(block.gasUsed);
																var totalGasUsed = new BigNumber(gasUsed.times(block.transactions[block.transactions.length - 1].gasPrice));
																var actionValue = new BigNumber(trace.action.value);
																trace.action.value = web3.toHex(actionValue.plus(totalGasUsed).toNumber());
															}
															ineachCallback();
														} else if (trace.type === 'call') {
															if (tokenExporter[trace.action.to]) {
																trace.isContract = true;
																async.waterfall([
																	function (tokeninfocallback) {
																		tokenExporter[trace.action.to].db.find({
																			$or: [{
																				"args._from": trace.action.from
																			}, {
																				"args._to": trace.action.from
																			}]
																		}).sort({
																			timestamp: -1
																		}).skip(0).limit(10000).exec(function (err, events) {
																			var tmpTokeninfo = {};
																			tmpTokeninfo.account = trace.action.to;
																			tmpTokeninfo.events = events;
																			tmpTokeninfo.name = tokenExporter[trace.action.to].token_name;
																			tmpTokeninfo.decimals = tokenExporter[trace.action.to].token_decimals;
																			tmpTokeninfo.symbol = tokenExporter[trace.action.to].token_symbol;
																			tmpTokeninfo.totalSupply = tokenExporter[trace.action.to].token_totalSupply;
																			tokeninfocallback(err, tmpTokeninfo);
																		});
																	}
																], function (err, tokeninfo) {
																	if (err) {
																		console.log("Error ", err);
																		ineachCallback();
																	} else {
																		if (tokeninfo) {
																			if (tokenExporter[trace.action.to].token_decimals) {
																				trace.token_decimals = tokenExporter[trace.action.to].token_decimals;
																			} else {
																				trace.token_decimals = 0;
																			}

																			if (tokenExporter[trace.action.to].token_symbol) {
																				trace.token_symbol = tokenExporter[trace.action.to].token_symbol;
																			} else {
																				trace.token_symbol = 'n/a';
																			}

																			if (tokeninfo && tokeninfo.events) {
																				async.eachSeries(tokeninfo.events, function (event, eventeachCallback) {
																					if (trace.transactionHash === event.transactionHash) {
																						if (event.event === "Transfer" || event.event === "Approval") {
																							if (event.args && event.args._value && trace.transactionPosition == event.transactionIndex) {
																								trace.action._value = web3.toHex((new BigNumber(event.args._value)).toNumber());
																								trace.action._to = event.args._to;
																							}
																						} else {
																							console.dir(event.args);
																						}
																					}
																					eventeachCallback();
																				}, function (err) {
																					ineachCallback();
																				});
																			} else {
																				ineachCallback();
																			}
																		} else {
																			ineachCallback();
																		}
																	}
																});
															} else {
																ineachCallback();
															}
														} else if (trace.type === 'create') {
															trace.isContract = true;
															//console.dir(trace);
															//console.log("-----------------------trace.type === 'create'-----------------------");
															if (tokenExporter[trace.result.address]) {
																if (tokenExporter[trace.result.address].token_decimals) {
																	trace.token_decimals = tokenExporter[trace.result.address].token_decimals;
																} else {
																	trace.token_decimals = 0;
																}

																if (tokenExporter[trace.result.address].token_symbol) {
																	trace.token_symbol = tokenExporter[trace.result.address].token_symbol;
																} else {
																	trace.token_symbol = 'n/a';
																}
															}
															ineachCallback();
														}
													}, function (err) {
														incallback(err, traces);
													});
												},
												function (traces, incallback) {
													async.eachSeries(traces, function (trace, ineachCallback) {
														if (trace.action.value) {
															trace.action.value = web3.toHex((new BigNumber(trace.action.value)).toNumber());
														}
														if (trace.token_decimals) {
															trace.token_decimals = web3.toHex((new BigNumber(trace.token_decimals)).toNumber());
														}

														if (trace.transactionHash) {
															var rds_tx_value = {
																transactionHash: trace.transactionHash,
																blockNumber: trace.blockNumber,
																date: block.timestamp ? block.timestamp.toString() : 0,
																type: trace.type,
																from: trace.action.from ? trace.action.from : "",
																to: trace.action.to ? trace.action.to : "",
																transactionPosition: trace.transactionPosition,
																value: trace.action.value ? trace.action.value : 0,
																isContract: trace.isContract,
																token_symbol: trace.token_symbol ? trace.token_symbol : "",
																token_decimals: trace.token_decimals ? trace.token_decimals : "",
																_value: trace.action._value ? trace.action._value : "",
																_to: trace.action._to ? trace.action._to : ""
															};
															redis.hmset(pre_fix_tx.concat(trace.transactionHash), rds_tx_value);

															redis.zadd(pre_fix_tx.concat("list"), parseInt(block.timestamp) + parseInt(trace.transactionPosition), trace.transactionHash);
															if (trace.action._to) {
																redis.zadd(pre_fix_account_tx.concat(trace.action._to), parseInt(block.timestamp) + parseInt(trace.transactionPosition), trace.transactionHash);
															} else {
																if (trace.action.to) {
																	redis.zadd(pre_fix_account_tx.concat(trace.action.to), parseInt(block.timestamp) + parseInt(trace.transactionPosition), trace.transactionHash);
																}
															}
															if (trace.action.from) {
																redis.zadd(pre_fix_account_tx.concat(trace.action.from), parseInt(block.timestamp) + parseInt(trace.transactionPosition), trace.transactionHash);
															}
														} else if (trace.type === 'reward' && trace.blockHash) {
															var rds_mining_value = {
																blockHash: trace.blockHash,
																blockNumber: trace.blockNumber,
																date: block.timestamp ? block.timestamp.toString() : 0,
																type: trace.type,
																rewardType: trace.action.rewardType,
																author: trace.action.author ? trace.action.author : "",
																value: trace.action.value ? trace.action.value : 0,
																isContract: trace.isContract,
															};
															redis.hmset(pre_fix_tx.concat(trace.blockHash), rds_mining_value);
															if (trace.blockHash && trace.action.author) {
																redis.zadd(pre_fix_account_tx.concat(trace.action.author), parseInt(block.timestamp), trace.blockHash);
															}
														} else {
															console.log("[!trace.transactionHash]", trace);
														}
														ineachCallback();
													}, function (err) {
														incallback(err);
													});
												}
											],
											function (err) {
												if (err) {
													console.log("outeachCallback Error ", err);
												}
												eachInCallback();
											});
									} else {
										eachInCallback();
									}
								}
							} else {
								eachInCallback();
							}
						}, function (err) {
							callback(err);
						});
					} else {
						callback(null);
					}
				}
			], function (err) {
				if (err) {
					console.log("Error ", err);
				}
				if (maxBlockNumber > 0) {
					console.log("[□□□□ End □□□□][blockStoreService]", printDateTime(), "~".concat(numberWithCommas(maxBlockNumber)), "block");
				}
				setTimeout(function () {
					next();
				}, configConstant.blockStoreServiceInterval);
			});
		},
		function (err) {
			console.log('!!!! blockStoreService STOP !!!!', err);
		}
	);
};

module.exports = blockstore;

function numberWithCommas(x) {
	var parts = x.toString().split(".");
	parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return parts.join(".");
}

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