const { Sequelize, Model, DataTypes, HasOne, Op } = require('sequelize');
const path = require('path');
var crypto = require('crypto');
const amqp = require("amqplib");
const fs = require('fs');
const cookieParser = require('cookie-parser');

var channel, connection;

const sequelize = new Sequelize('postgres://express:express@postgresnode:5432/express', {
    pool: {
    max: 50,
    min: 0,
    acquire: 30000,
    idle: 10000
  }});

const Messages = sequelize.define('messages', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        title: DataTypes.TEXT('long'),
        content: DataTypes.TEXT('long'),
        commentCount: Sequelize.INTEGER,
        upvoteCount: Sequelize.INTEGER,
        user_id: Sequelize.STRING,
    }, {
        indexes: [
            {
                unique: true,
                fields: ['id']
            },
            {
                fields: ['user_id']
            }]
        }
);

const Replies = sequelize.define('replies', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    content: DataTypes.TEXT('long'),
    upvoteCount: Sequelize.INTEGER,
    user_id: Sequelize.STRING,
}, {
    indexes: [
        {
            unique: true,
            fields: ['id']
        },
        {
            fields: ['user_id']
        }]
    }
);

const MessageVotes = sequelize.define('message_votes', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    status: Sequelize.STRING,
    user_id: Sequelize.STRING,
}, {
    indexes: [
        {
            unique: true,
            fields: ['id']
        },
        {
            fields: ['user_id']
        }]
    }
);

const ReplyVotes = sequelize.define('reply_votes', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    status: Sequelize.STRING,
    user_id: Sequelize.STRING,
}, {
    indexes: [
        {
            unique: true,
            fields: ['id']
        },
        {
            fields: ['user_id']
        }]
    }
);

Messages.hasMany(Replies, {
    foreignKey: 'messageID'
  })
Replies.belongsTo(Messages)

Messages.hasMany(MessageVotes)
MessageVotes.belongsTo(Messages)

Replies.hasMany(ReplyVotes)
ReplyVotes.belongsTo(Replies)

//Trick to use await of top level
connect_to_db_and_queue(sequelize).then(async ()=>{
    populate_db()
    console.log("Finished setting up DB.")
    await initialize_exchange()
    console.log("Finished setting up message broker.")
    app.listen(5002, function() {
        console.log('listening on 5002')
      })
}).catch(()=>{console.log("Error")})

const baseurl = "http://localhost:5002/"
const express = require('express');
const { reduce } = require('lodash');
const app = express();

app.use(cookieParser());
app.use(express.json());

//Instruct the user to turn cookies on
app.get('/', async (req, res) => {
    var cookie = req.cookies.userID;
    if (cookie === undefined) {
      var randomNumber=Math.random().toString();
      randomNumber=randomNumber.substring(2,randomNumber.length);
      res.cookie('userID',randomNumber, { maxAge: 1000*60*60*24*365, httpOnly: true });
      console.log('cookie created successfully');
    } else {
      // yes, cookie was already present 
      console.log('cookie exists', cookie);
    } 
    res.sendFile(path.join(__dirname, '/index.html'));
})

app.get('/api/messages',async (req, res) => {
    var offset = req.query.offset;
    var userID = req.cookies.userID;
    console.log(`offset: ${offset}, userID: ${userID}`)
    if (userID === undefined) {
        res.status(401)
        res.send('Unauthorized')
        return
    }
    const messages = await Messages.findAll({
        where: { id: {
            [Op.gt]: offset
          } },
        limit: 20,
        order: [['id', 'ASC']],
        include: {
            model: MessageVotes,
            where: { user_id : userID },
            required: false
        }
    });
    console.log("Found the following messages: " + messages)
    res.status(200)
    if(messages.length>0){
        offset = messages[messages.length-1].id
    }
    res.send({ 'newOffset' : offset, 'messages' : messages})
})

app.get('/api/messages/:id/replies',async (req, res) => {
    var offset = req.query.offset;
    var message_id = req.params['id'];
    var userID = req.cookies.userID;
    if (userID === undefined) {
        res.status(401)
        res.send('Unauthorized')
        return
    }
    const replies = await Replies.findAll({
        where: { 
            id: {
                [Op.gt]: offset
            }, 
            messageID : message_id
        },
        limit: 20,
        include: {
            model: ReplyVotes,
            where: { user_id : userID },
            required: false
        }
    });
    console.log("Found the following replies: " + replies)
    res.status(200)
    if(replies.length>0){
        offset = replies[replies.length-1].id
    }
    res.send({ 'newOffset' : offset, 'replies' : replies})
})

app.get('/messages/:id',async (req, res) => {
    var messageID = req.params['id'];
    var cookie = req.cookies.userID;
    if (cookie === undefined) {
      var randomNumber=Math.random().toString();
      randomNumber=randomNumber.substring(2,randomNumber.length);
      res.cookie('userID',randomNumber, { maxAge: 1000*60*60*24*365, httpOnly: true });
      console.log('cookie created successfully');
    } else {
      // yes, cookie was already present 
      console.log('cookie exists', cookie);
    }
    const message = await Messages.findOne({
        where: { id: messageID }
    });
    if(message==null || message==null) {
        res.status(404)
        res.send('Not found')
        return
    }
    fs.readFile('thread.template', 'utf8', (err, data) => {
        if (err) {
          console.error(err);
          res.status(500)
          res.send('Internal server error')
          return;
        }
        res.status(200)
        res.send(data.replace('@@@@@@', messageID))
      });
})

app.get('/api/messages/:id',async (req, res) => {
    var messageID = req.params['id'];
    var userID = req.cookies.userID;
    if (userID === undefined) {
        res.status(401)
        res.send('Forbidden.')
    }
    const message = await Messages.findOne({
        where: { id: messageID },
        include: {
            model: MessageVotes,
            where: { user_id : userID },
            required: false
        }
    });
    if(message==null || message==null) {
        res.status(404)
        res.send('Not found')
        return
    }
    res.status(200)
    res.send(message)
})

app.get('/api/messages/:id/upvote',async (req, res) => {
    var messageID = req.params['id'];
    var user = req.cookies.userID;
    if (user === undefined) {
        res.status(401)
        res.send('Unauthorized')
        return
    }
    const message = await Messages.findOne({
        where: { id: messageID }
    });
    if(message==null || message==null) {
        res.status(404)
        res.send('Not found')
        return
    }
    emitMessageUpvoteEvent(messageID, user)
    res.status(200)
    res.send('Upvoted message with id ' + messageID + ' successfully.')
})

app.get('/api/messages/:id/downvote',async (req, res) => {
    var messageID = req.params['id'];
    var user = req.cookies.userID;
    if (user === undefined) {
        res.status(401)
        res.send('Unauthorized')
        return
    }
    const message = await Messages.findOne({
        where: { id: messageID }
    });
    if(message==null || message==null) {
        res.status(404)
        res.send('Not found')
        return
    }
    emitMessageDownvoteEvent(messageID, user)
    res.status(200)
    res.send('Downvoted message with id ' + messageID + ' successfully.')
})

app.get('/api/messages/:id/neutralize',async (req, res) => {
    var messageID = req.params['id'];
    var user = req.cookies.userID;
    if (user === undefined) {
        res.status(401)
        res.send('Unauthorized')
        return
    }
    const message = await Messages.findOne({
        where: { id: messageID }
    });
    if(message==null || message==null) {
        res.status(404)
        res.send('Not found')
        return
    }
    emitMessageNeutralVoteEvent(messageID, user)
    res.status(200)
    res.send('Neutralized vote for message with id ' + messageID + ' successfully.')
})

app.get('/api/replies/:id', async (req, res) => {
    var replyID = req.params['id'];
    var userID = req.cookies.userID;
    if (userID === undefined) {
        res.status(401)
        res.send('Forbidden.')
    }
    const reply = await Replies.findOne({
         where: { id: replyID },
         include: {
            model: ReplyVotes,
            where: { user_id : userID },
            required: false
        }
    });
    if(reply==null || reply==null) {
        res.status(404)
        res.send('Not found')
        return
    }
    res.status(200)
    res.send(reply) 
    return
})

app.get('/api/replies/:id/upvote', async (req, res) => {
    var replyID = req.params['id'];
    var user = req.cookies.userID;
    if (user === undefined) {
        res.status(401)
        res.send('Unauthorized')
        return
    }
    const reply = await Replies.findOne({
         where: { id: replyID }
    });
    if(reply==null || reply==null) {
        res.status(404)
        res.send('Not found')
        return
    }
    emitReplyUpvoteEvent(replyID, user)
    res.status(200)
    res.send('Upvoted reply with id ' + replyID + ' successfully.')
    return
})

app.get('/api/replies/:id/downvote', async (req, res) => {
    var replyID = req.params['id'];
    var user = req.cookies.userID;
    if (user === undefined) {
        res.status(401)
        res.send('Unauthorized')
        return
    }
    const reply = await Replies.findOne({
         where: { id: replyID }
    });
    if(reply==null || reply==null) {
        res.status(404)
        res.send('Not found')
        return
    }
    emitReplyDownvoteEvent(replyID, user)
    res.status(200)
    res.send('Downvoted reply with id ' + replyID + ' successfully.')
    return
})

app.get('/api/replies/:id/neutralize', async (req, res) => {
    var replyID = req.params['id'];
    var user = req.cookies.userID;
    if (user === undefined) {
        res.status(401)
        res.send('Unauthorized')
        return
    }
    const reply = await Replies.findOne({
         where: { id: replyID }
    });
    if(reply==null || reply==null) {
        res.status(404)
        res.send('Not found')
        return
    }
    emitReplyNeutralVoteEvent(replyID, user)
    res.status(200)
    res.send('Neutralized vote for reply with id ' + replyID + ' successfully.')
    return
})

app.post('/api/messages', async (req, res) => {
    var user = req.cookies.userID;
    if (user === undefined) {
        res.status(401)
        res.send('Unauthorized')
        return
    }
    if(req.cookies.userID==null || req.body.title==null || req.body.content==null 
        || req.cookies.userID==undefined || req.body.title==undefined || req.body.content==undefined) {
        res.status(400)
        res.send('Bad request')
        return
    }
    //Emit event to create message
    emitMessageSubmitEvent(req.body.title, req.body.content, user)
    res.status(201)
    res.status('Message submitted.')
})

app.post('/api/replies', async (req, res) => {
    var user = req.cookies.userID;
    if (user === undefined) {
        res.status(401)
        res.send('Unauthorized')
        return
    }
    if(req.cookies.userID==null || req.body.content==null || req.body.message_id==null 
        || req.cookies.userID==undefined || req.body.content==undefined || req.body.message_id==undefined) {
        res.status(400)
        res.send('Bad request')
        return
    }
    //Emit event to create reply
    emitReplySubmitEvent(req.body.content, user, req.body.message_id)
    res.status(201)
    res.status('Reply submitted.')
})

async function connect_to_db_and_queue(sequelize) {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    console.log('Trying to connect to database...')
    while(true) {
        try {
            var br = true;
            await delay(1000)
            await sequelize.authenticate()
            await sequelize.sync().catch((error) => {console.error('Unable to connect to the database. Retrying...', error); br=false}).then(()=>{console.log('Synced to database successfully.');})
            if(br==true)
                break
        } catch (error) {
            console.error('Unable to connect to the database. Retrying...', error);
        }
    }
    console.log("Connecting to RabbitMQ...")
    while(true) {
        await sleep(2000)
        try {
            connection = await amqp.connect("amqp://rabbit:5672");
            channel = await connection.createChannel()
            
            // connect to 'test-queue', create one if doesnot exist already
            await channel.assertQueue("HEALTH_CHECK")
            console.log("Connected to RabbitMQ!")
            break
        } catch (error) {
            console.log("Waiting for RabbitMQ to be online...")
        }
    }
    return
}

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

async function initialize_exchange() {
    //Create exchange for frontend_events
    await channel.assertExchange('frontend_events', 'x-consistent-hash')
}

function emitMessageUpvoteEvent(message_id, user_id) {
    console.log("Emitting message upvote event")
    let payload = { 'type' : 'MESSAGE_UPVOTE', 'user' : user_id, 'id' : message_id}
    channel.publish('frontend_events', user_id+'', Buffer.from(JSON.stringify(payload)))
}
function emitMessageDownvoteEvent(message_id, user_id) {
    console.log("Emitting message downvote event")
    let payload = { 'type' : 'MESSAGE_DOWNVOTE', 'user' : user_id, 'id' : message_id}
    channel.publish('frontend_events', user_id+'', Buffer.from(JSON.stringify(payload)))
}
function emitMessageNeutralVoteEvent(message_id, user_id) {
    console.log("Emitting message neutral vote event")
    let payload = { 'type' : 'MESSAGE_NEUTRALVOTE', 'user' : user_id, 'id' : message_id}
    channel.publish('frontend_events', user_id+'', Buffer.from(JSON.stringify(payload)))
}
function emitMessageSubmitEvent(title, content, user_id) {
    console.log("Emitting message submit event")
    let payload = { 'type' : 'MESSAGE_SUBMIT', 'user' : user_id, 'title' : title, 'content' : content }
    channel.publish('frontend_events', user_id+'', Buffer.from(JSON.stringify(payload)))
}
function emitReplyUpvoteEvent(reply_id, user_id) {
    console.log("Emitting reply upvote event")
    let payload = { 'type' : 'REPLY_UPVOTE', 'user' : user_id, 'id' : reply_id}
    channel.publish('frontend_events', user_id+'', Buffer.from(JSON.stringify(payload)))
}
function emitReplyDownvoteEvent(reply_id, user_id) {
    console.log("Emitting reply downvote event")
    let payload = { 'type' : 'REPLY_DOWNVOTE', 'user' : user_id, 'id' : reply_id}
    channel.publish('frontend_events', user_id+'', Buffer.from(JSON.stringify(payload)))
}
function emitReplyNeutralVoteEvent(reply_id, user_id) {
    console.log("Emitting reply neutral vote event")
    let payload = { 'type' : 'REPLY_NEUTRALVOTE', 'user' : user_id, 'id' : reply_id}
    channel.publish('frontend_events', user_id+'', Buffer.from(JSON.stringify(payload)))
}
function emitReplySubmitEvent(content, user_id, message_id) {
    console.log("Emitting reply submit event")
    let payload = { 'type' : 'REPLY_SUBMIT', 'message' : message_id, 'user' : user_id, 'content' : content}
    channel.publish('frontend_events', user_id+'', Buffer.from(JSON.stringify(payload)))
}

async function populate_db() {
}

