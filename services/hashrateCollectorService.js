var async = require('async');
const redis = require("redis");
const pre_fix = 'explorerBlocks:';
const pre_fix_chart = 'explorerBlocksChart:';
const divide = 10000;

var hashratecollector = function (config) {
	async.forever(
		function (next) {
			console.log("[▷▷▷ Start ▷▷▷][hashrateCollectorService]", printDateTime());
			var data = {};
			var tmpData = {};
			tmpData.BlockTime = [];
			tmpData.Difficulty = [];
			tmpData.NetHashrate = [];
			tmpData.Transactions = [];

			var dbSaveDatas = {};
			data.startTime = new Date();
			data.dbLastBlock = 0;
			data.dbChartLastBlock = 0;
			data.blockCount = 1000;

			data.xData = [];
			data.xBlocknumber = [];
			data.xNumberOfBlocks = [];

			data.lastnumber = 0;
			data.datasets = [];
			data.datasets[0] = {
				"name": "BlockTime",
				"data": [],
				"unit": " s",
				"type": "line",
				"valueDecimals": 2
			};
			data.datasets[1] = {
				"name": "Difficulty",
				"data": [],
				"unit": " TH",
				"type": "area",
				"valueDecimals": 4
			};
			data.datasets[2] = {
				"name": "NetHashrate",
				"data": [],
				"unit": " GH/s",
				"type": "line",
				"valueDecimals": 2
			};
			data.datasets[3] = {
				"name": "Transactions",
				"data": [],
				"unit": " tx",
				"type": "area",
				"valueDecimals": 0
			};

			const client = redis.createClient();
			client.on("error", function (err) {
				console.log("Error " + err);
			});

			async.waterfall([
				function (callback) {
					client.hget(pre_fix.concat("lastblock"), "lastblock", function (err, result) {
						return callback(err, result);
					});
				},
				function (dbLastBlock, callback) {
					data.dbLastBlock = Number(dbLastBlock);
					client.hget(pre_fix_chart.concat("lastblock"), "lastblock", function (err, result) {
						return callback(err, result);
					});
				},
				function (dbChartLastBlock, callback) {
					data.dbChartLastBlock = Number(dbChartLastBlock);
					client.lrange(pre_fix_chart.concat("xData"), 0, -1, function (err, result) {
						return callback(err, result);
					});
				},
				function (xData, callback) {
					for (let i = 0; i < xData.length; i++) {
						data.xData.push(Number(xData[i]));
					}
					client.lrange(pre_fix_chart.concat("xBlocknumber"), 0, -1, function (err, result) {
						return callback(err, result);
					});
				},
				function (xBlocknumber, callback) {
					for (let i = 0; i < xBlocknumber.length; i++) {
						data.xBlocknumber.push(Number(xBlocknumber[i]));
					}
					client.lrange(pre_fix_chart.concat("xNumberOfBlocks"), 0, -1, function (err, result) {
						return callback(err, result);
					});
				},
				function (xNumberOfBlocks, callback) {
					for (let i = 0; i < xNumberOfBlocks.length; i++) {
						data.xNumberOfBlocks.push(Number(xNumberOfBlocks[i]));
					}
					client.lrange(pre_fix_chart.concat("BlockTime"), 0, -1, function (err, result) {
						return callback(err, result);
					});
				},
				function (datasets, callback) {
					for (let i = 0; i < datasets.length; i++) {
						data.datasets[0].data.push(Number(datasets[i]));
					}
					client.lrange(pre_fix_chart.concat("Difficulty"), 0, -1, function (err, result) {
						return callback(err, result);
					});
				},
				function (datasets, callback) {
					for (let i = 0; i < datasets.length; i++) {
						data.datasets[1].data.push(Number(datasets[i]));
					}
					client.lrange(pre_fix_chart.concat("NetHashrate"), 0, -1, function (err, result) {
						return callback(err, result);
					});
				},
				function (datasets, callback) {
					for (let i = 0; i < datasets.length; i++) {
						data.datasets[2].data.push(Number(datasets[i]));
					}
					client.lrange(pre_fix_chart.concat("Transactions"), 0, -1, function (err, result) {
						return callback(err, result);
					});
				},
				function (datasets, callback) {
					for (let i = 0; i < datasets.length; i++) {
						data.datasets[3].data.push(Number(datasets[i]));
					}

					data.blockCount = data.dbLastBlock - data.dbChartLastBlock;
					data.lastBlockTimes = 0;
					dbSaveDatas.xData = [];
					dbSaveDatas.BlockTime = [];
					dbSaveDatas.xBlocknumber = [];
					dbSaveDatas.xNumberOfBlocks = [];
					dbSaveDatas.Difficulty = [];
					dbSaveDatas.NetHashrate = [];
					dbSaveDatas.Transactions = [];

					var cntDatasets = 0;
					if (data.blockCount > 0) {
						async.times(data.blockCount, function (n, next) {
							var field = data.dbChartLastBlock + n;
							if (field > 0) {
								var fieldkey = pre_fix.concat((field - (field % divide)) + ":").concat(field);
								client.hmget(fieldkey, 'timestamp', 'difficulty', 'number', 'transactions', function (err, block_info) {
									if (err || !block_info) {
										console.log(fieldkey + ": no block infomation");
										return next(err, null);
									} else {
										var baseOneTime = (60 * 60 * 1 * 1000);
										var baseTime = (60 * 60 * 2 * 1000);
										var hmgettimestamp = Number(block_info[0]) * 1000;
										var nowTime = new Date();
										var accNowTime = (nowTime - (nowTime % baseOneTime)) % baseTime == 0 ? (nowTime - (nowTime % baseOneTime)) - baseOneTime : (nowTime - (nowTime % baseOneTime));
										if (accNowTime > hmgettimestamp) {
											var hmgetdifficulty = Number(block_info[1]);
											var hmgettransactions = Number(block_info[3]);
											var hmgetnumber = Number(block_info[2]);
											if (data.lastBlockTimes > 0) {
												var currentBlockTime = (hmgettimestamp - data.lastBlockTimes) / 1000;
												var currentDifficulty = hmgetdifficulty;
												var currentTransactions = hmgettransactions;
												var perSixHour = (hmgettimestamp - (hmgettimestamp % baseOneTime)) % baseTime == 0 ? (hmgettimestamp - (hmgettimestamp % baseOneTime)) - baseOneTime : (hmgettimestamp - (hmgettimestamp % baseOneTime));
												var idx = data.xData.indexOf(perSixHour);
												//console.log("nowTime:", nowTime.toLocaleString(), "accNowTime:", (new Date(accNowTime)).toLocaleString(), "hmgettimestamp:", (new Date(hmgettimestamp)).toLocaleString(), "perSixHour:", (new Date(perSixHour)).toLocaleString());

												if (idx == -1) {
													cntDatasets = 1;
													data.xData.push(perSixHour);
													data.xBlocknumber.push(hmgetnumber);
													data.xNumberOfBlocks.push(cntDatasets);
													tmpData.BlockTime.push(currentBlockTime);
													tmpData.Difficulty.push(currentDifficulty / 1000000000000);
													tmpData.Transactions.push(currentTransactions);
													console.log("hmgetnumber:", hmgetnumber, "hmgettimestamp:", (new Date(hmgettimestamp)).toLocaleString(), "perSixHour:", (new Date(perSixHour)).toLocaleString());
													data.datasets[0].data.push(tmpData.BlockTime[data.xData.length - 1]);
													data.datasets[1].data.push(tmpData.Difficulty[data.xData.length - 1]);
													data.datasets[2].data.push((tmpData.Difficulty[data.xData.length - 1] / tmpData.BlockTime[data.xData.length - 1]) * 1000);
													data.datasets[3].data.push(tmpData.Transactions[data.xData.length - 1]);

													data.lastnumber = hmgetnumber;
													dbSaveDatas.xData.push(perSixHour);
													dbSaveDatas.xBlocknumber.push(hmgetnumber);
													dbSaveDatas.xNumberOfBlocks.push(cntDatasets);
													dbSaveDatas.BlockTime.push(tmpData.BlockTime[data.xData.length - 1]);
													dbSaveDatas.Difficulty.push(tmpData.Difficulty[data.xData.length - 1]);
													dbSaveDatas.NetHashrate.push((tmpData.Difficulty[data.xData.length - 1] / tmpData.BlockTime[data.xData.length - 1]) * 1000);
													dbSaveDatas.Transactions.push(tmpData.Transactions[data.xData.length - 1]);
												} else {
													cntDatasets++;
													data.xData[idx] = perSixHour;
													data.xBlocknumber[idx] = hmgetnumber;
													data.xNumberOfBlocks[idx] = cntDatasets;

													if (!tmpData.BlockTime[idx]) {
														tmpData.BlockTime[idx] = currentBlockTime;
													} else {
														tmpData.BlockTime[idx] += currentBlockTime;
													}
													if (!tmpData.Difficulty[idx]) {
														tmpData.Difficulty[idx] = currentDifficulty / 1000000000000;
													} else {
														tmpData.Difficulty[idx] += currentDifficulty / 1000000000000;
													}
													if (!tmpData.Transactions[idx]) {
														tmpData.Transactions[idx] = currentTransactions;
													} else {
														tmpData.Transactions[idx] += currentTransactions;
													}

													data.datasets[0].data[idx] = tmpData.BlockTime[data.xData.length - 1] / cntDatasets;
													data.datasets[1].data[idx] = tmpData.Difficulty[data.xData.length - 1] / cntDatasets;
													data.datasets[2].data[idx] = (data.datasets[1].data[idx] / data.datasets[0].data[idx]) * 1000;
													data.datasets[3].data[idx] = tmpData.Transactions[data.xData.length - 1];

													data.lastnumber = hmgetnumber;
													var dbsaveIdx = dbSaveDatas.xData.indexOf(perSixHour);
													dbSaveDatas.xData[dbsaveIdx] = perSixHour;
													dbSaveDatas.xBlocknumber[dbsaveIdx] = hmgetnumber;
													dbSaveDatas.xNumberOfBlocks[dbsaveIdx] = cntDatasets;
													dbSaveDatas.BlockTime[dbsaveIdx] = tmpData.BlockTime[data.xData.length - 1] / cntDatasets;
													dbSaveDatas.Difficulty[dbsaveIdx] = tmpData.Difficulty[data.xData.length - 1] / cntDatasets;
													dbSaveDatas.NetHashrate[dbsaveIdx] = (data.datasets[1].data[idx] / data.datasets[0].data[idx]) * 1000;
													dbSaveDatas.Transactions[dbsaveIdx] = tmpData.Transactions[data.xData.length - 1];
												}
											}
										}
										if (hmgettimestamp > 0) {
											data.lastBlockTimes = hmgettimestamp;
										}
										next(err, block_info);
									}
								});
							} else {
								next(null, null);
							}
						}, function (err, blocks) {
							callback(err, blocks);
						});
					} else {
						callback("Not found block.", null);
					}
				}
			], function (err, blocks) {
				if (err) {
					console.log("Error " + err);
				}

				if (data.lastnumber > 0) {
					client.hset(pre_fix_chart.concat("lastblock"), "lastblock", data.lastnumber);
				}
				for (let i = 0; i < dbSaveDatas.xData.length; i++) {
					client.rpush(pre_fix_chart.concat('xData'), dbSaveDatas.xData[i]);
					client.rpush(pre_fix_chart.concat('xBlocknumber'), dbSaveDatas.xBlocknumber[i]);
					client.rpush(pre_fix_chart.concat('xNumberOfBlocks'), dbSaveDatas.xNumberOfBlocks[i]);
					client.rpush(pre_fix_chart.concat('BlockTime'), dbSaveDatas.BlockTime[i]);
					client.rpush(pre_fix_chart.concat('Difficulty'), dbSaveDatas.Difficulty[i]);
					client.rpush(pre_fix_chart.concat('NetHashrate'), dbSaveDatas.NetHashrate[i]);
					client.rpush(pre_fix_chart.concat('Transactions'), dbSaveDatas.Transactions[i]);
				}
				console.log("[□□□□ End □□□□][hashrateCollectorService]", printDateTime());
				setTimeout(function () {
					next();
				}, config.hashrateCollectorServiceInterval);
			});
		},
		function (err) {
			console.log('!!!! hashrateCollectorService STOP !!!!', err);
		}
	);
};

module.exports = hashratecollector;

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

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}