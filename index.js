//test
/* var globalTunnel = require('global-tunnel');
process.env.https_proxy = 'http://127.0.0.1:1087';
globalTunnel.initialize(); */
//
const config = require('./config.json');
const Yas = require('eosjs-classic-yas');
const ecc = Yas.modules.ecc;
const mongodb = require('mongodb');
const TelegramBot = require('node-telegram-bot-api');
const tgToken = config.telegram.token;
const bot = new TelegramBot(tgToken, { polling: true });

const dbUrl = config.mongodb.url;
const dbName = config.mongodb.dbName;
var db;
const reg = new RegExp(/^([a-z1-5]){12}$/);

mongodb.MongoClient.connect(dbUrl, function (err, database) {
    if (err) {
        console.error("mongodb error", err);
    }
    db = database.db(dbName);
});


const yasConfig = {
    chainId: config.chain.id, // 32 byte (64 char) hex string
    keyProvider: [config.chain.key], // WIF string or array of keys..
    httpEndpoint: config.chain.endPoint,
    expireInSeconds: 60,
    broadcast: true,
    verbose: false, // API activity
    sign: true
}
const yas = Yas(yasConfig);
const faucet = config.chain.account;

const reply_msg = "Welcome to use Free YAS Account Bot, You can get a free yas account every device.\n"
    + "欢迎使用免费YAS账户机器人，每个设备可以注册一个免费YAS账户\n\n"
    + "First, Go to https://eos-key.mytokenpocket.vip to generate EOS key pair, keep your private key safety.\n"
    + "首先，访问 https://eos-key.mytokenpocket.vip  生成EOS公私钥对，请保存好私钥。\n\n"
    + "Then, input : newaccount:<username>:<public key>\n" + "然后，回复 : newaccount:<账户名>:<公钥>\n\n"
    + "username must have 12 characters with a-z and 1-5, public key is generated in step1.\n"
    + "账户名必须是由a-z和1-5字符组成的12位账户名.\n\n"
    + "example input :\n回复示例:\nnewaccount:free1account:EOS7LzEx6LAVPfNdc8qikXrAf819xTPHdFuZNEjiQb7rEovG6dqUY\n\n\n"
    + "tool developed by plusplusplus bp , please vote for us.\n"
    + "工具由 plusplusplus 节点开发，请投票支持我们"

//tg bot
// bot.onText(/\/start/, (msg) => {

//     bot.sendMessage(msg.chat.id, reply_msg);

// });

bot.on('message', (msg) => {

    //console.log(msg);
    if (msg.text.toString().toLowerCase().indexOf("newaccount") === 0) {
        let params = msg.text.toString().split(":");
        console.log(params);
        let account = params[1];
        let pubKey = params[2];
        let returnJson = {};
        let userInfo = msg.from;
        let deviceId = "telegram" + msg.from.id;

        //正则检查
        if (!account.match(reg)) {
            bot.sendMessage(msg.chat.id, "account name is illegal!\n账户名非法");
            return;
        }

        //公钥格式检查
        if (!ecc.isValidPublic(pubKey)) {
            bot.sendMessage(msg.chat.id, "Error Public Key!\n公钥错误");
            return;
        }

        checkId(deviceId).then(() => {
            //发送交易
            return sendTransaction(account, pubKey);
        }).then(res => {
            returnJson = res;
            let object = {
                deviceId: deviceId,
                account: account,
                pubKey: pubKey,
                userInfo: userInfo
            }
            return insertDeviceId(object);
        }).then(res => {
            bot.sendMessage(msg.chat.id, "create account ok!\n创建账户成功!\ntxid:\n" + "http://yas.plus/transactions/" + returnJson.transaction_id);
            return;
        }).catch(err => {
            if (JSON.stringify(err).indexOf("Account name already exists") > -1) {
                bot.sendMessage(msg.chat.id, "Account name already exists\n账户已被注册");
            } else if (err.error) {
                bot.sendMessage(msg.chat.id, err.error);
            } else {
                bot.sendMessage(msg.chat.id, err.toString());
            }
            return;
        });


    } else {
        bot.sendMessage(msg.chat.id, reply_msg);
    }

});

function insertDeviceId(object) {
    return new Promise((resolve, reject) => {
        let collection = db.collection('account');
        collection.insertOne(object, function (err, res) {
            if (err) {
                reject({ code: 500, error: err });
            } else {
                resolve(res)
            }
        });
    })
}

function sendTransaction(newaccount, pubKey) {

    const authorization = [{
        actor: faucet,
        permission: "active"
    }]
    const tx_data = {
        actions: [{
            account: 'eosio',
            name: 'newaccount',
            authorization,
            data: {
                creator: faucet,
                name: newaccount,
                owner: {
                    "threshold": 1,
                    "keys": [
                        {
                            "key": pubKey,
                            "weight": 1
                        }
                    ],
                    "accounts": [],
                    "waits": []
                },
                active: {
                    "threshold": 1,
                    "keys": [
                        {
                            "key": pubKey,
                            "weight": 1
                        }
                    ],
                    "accounts": [],
                    "waits": []
                }
            }
        }, {
            account: 'eosio',
            name: 'buyrambytes',
            authorization,
            data: {
                payer: faucet,
                receiver: newaccount,
                bytes: 3500
            }
        }, {
            account: 'eosio',
            name: 'delegatebw',
            authorization,
            data: {
                from: faucet,
                receiver: newaccount,
                stake_net_quantity: '0.0100 YAS',
                stake_cpu_quantity: '0.0100 YAS',
                transfer: 0
            }
        }]
    }
    return yas.transaction(tx_data)
}

/**
 * 检查设备是否已注册过
 * @param {*} deviceId 设备号
 */
function checkId(deviceId) {
    return new Promise((resolve, reject) => {
        let collection = db.collection('account');
        collection.findOne({ "deviceId": deviceId }, function (err, doc) {
            if (err) {
                reject({ code: 500, error: err });
            } else {
                //存在记录 
                if (doc) {
                    reject({ code: 3, error: 'already have a free account!\n已免费注册' });
                } else {
                    resolve();
                }
            }
        });
    });
}
