const { Sequelize, Model, DataTypes, HasOne, Op } = require('sequelize');
const path = require('path');
var crypto = require('crypto');
const fs = require('fs');
const cookieParser = require('cookie-parser');

const sequelize = new Sequelize(`postgres://${process.env.PGUSER}:${process.env.PGPW}@pg-cluster-rw:5432/app`, {
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
        },
        {
            unique: true,
            fields: ['id', 'messageId']
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

Messages.Replies = Messages.hasMany(Replies, {
    foreignKey: 'messageID'
  })
Replies.Messages = Replies.belongsTo(Messages)

Messages.MessageVotes = Messages.hasMany(MessageVotes)
MessageVotes.Messages = MessageVotes.belongsTo(Messages)

Replies.ReplyVotes = Replies.hasMany(ReplyVotes)
ReplyVotes.Replies = ReplyVotes.belongsTo(Replies)

//Trick to use await of top level
connect_to_db_and_queue(sequelize).then(async ()=>{
    populate_db()
    console.log("Finished setting up DB.")
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
      res.cookie('userID',randomNumber, { maxAge: 1000*60*60*24*365, httpOnly: false });
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
      res.cookie('userID',randomNumber, { maxAge: 1000*60*60*24*365, httpOnly: false });
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
    fs.readFile('thread.html', 'utf8', (err, data) => {
        if (err) {
          console.error(err);
          res.status(500)
          res.send('Internal server error')
          return;
        }
        res.status(200)
        res.send(data.replaceAll('@@@@@@', messageID))
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

    const [messageVote, created] = await MessageVotes.findOrCreate({ where : {
        user_id: user,
        messageId: messageID
    }})

    if(messageVote.status == "D")
        Messages.increment('upvoteCount', { by: 2, where: { id: messageID }});
    else if (messageVote.status == "N" || messageVote.status==null || messageVote.status=='' || messageVote.status==undefined)
        Messages.increment('upvoteCount', { by: 1, where: { id: messageID }});

    messageVote.status = "U"
    await messageVote.save()

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

    const [messageVote, created] = await MessageVotes.findOrCreate({ where : {
        user_id: user,
        messageId: messageID
    }})

    if(messageVote.status == "U")
        Messages.decrement('upvoteCount', { by: 2, where: { id: messageID }});
    else if (messageVote.status == "N" || messageVote.status==null || messageVote.status=='' || messageVote.status==undefined)
        Messages.decrement('upvoteCount', { by: 1, where: { id: messageID }});

    messageVote.status = "D"
    await messageVote.save()

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

    const [messageVote, created] = await MessageVotes.findOrCreate({ where : {
        user_id: user,
        messageId: messageID
    }})

    if(messageVote.status == "D")
        Messages.increment('upvoteCount', { by: 1, where: { id: messageID }});
    else if (messageVote.status == "U")
        Messages.decrement('upvoteCount', { by: 1, where: { id: messageID }});

    messageVote.status = "N"
    await messageVote.save()

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

    const [replyVote, created] = await ReplyVotes.findOrCreate({ where : {
        user_id: user,
        replyId: replyID
    }})

    if(replyVote.status == "D")
        Replies.increment('upvoteCount', { by: 2, where: { id: replyID }});
    else if (replyVote.status == "N" || replyVote.status==null || replyVote.status=='' || replyVote.status==undefined)
        Replies.increment('upvoteCount', { by: 1, where: { id: replyID }});

    replyVote.status = "U"
    await replyVote.save()

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

    const [replyVote, created] = await ReplyVotes.findOrCreate({ where : {
        user_id: user,
        replyId: replyID
    }})

    if(replyVote.status == "U")
        Replies.decrement('upvoteCount', { by: 2, where: { id: replyID }});
    else if (replyVote.status == "N" || replyVote.status==null || replyVote.status=='' || replyVote.status==undefined)
        Replies.decrement('upvoteCount', { by: 1, where: { id: replyID }});

    replyVote.status = "D"
    await replyVote.save()

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

    const [replyVote, created] = await ReplyVotes.findOrCreate({ where : {
        user_id: user,
        replyId: replyID
    }})

    if(replyVote.status == "D")
        Replies.increment('upvoteCount', { by: 1, where: { id: replyID }});
    else if (replyVote.status == "U")
        Replies.decrement('upvoteCount', { by: 1, where: { id: replyID }});

    replyVote.status = "N"
    await replyVote.save()

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
    if(req.cookies.userID==null || req.body.title==null || req.body.content==null || req.body.offset==null
        || req.cookies.userID==undefined || req.body.title==undefined || req.body.content==undefined || req.body.offset==null) {
        res.status(400)
        res.send('Bad request')
        return
    }
    //Save message to database
    /*        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        title: DataTypes.TEXT('long'),
        content: DataTypes.TEXT('long'),
        commentCount: Sequelize.INTEGER,
        upvoteCount: Sequelize.INTEGER,
        user_id: Sequelize.STRING,*/
    const message = await Messages.create({
        title: req.body.title,
        content: req.body.content,
        commentCount: 0,
        upvoteCount: 1,
        user_id: user,
        message_votes : [{
            status: "U",
            user_id: user,
        }]
    },{
        include: [{
          association:  Messages.MessageVotes,
          include: [MessageVotes.Messages]
        }]
      })

    const gap_messages = await Messages.findAll({
        where: { id: {
            [Op.between]: [Number(req.body.offset)+1, message.id]
          } },
        order: [['id', 'ASC']],
        include: {
            model: MessageVotes,
            where: { user_id : user },
            required: false
        }
    });

    var newOffset = req.body.offset
    if(gap_messages.length>0){
        newOffset = gap_messages[gap_messages.length-1].id
    }

    //Emit event to create message
    let uniqueRay = Math.round(Math.random()*100000000)+''
    emitMessageSubmitEvent(req.body.title, req.body.content, user, uniqueRay)
    //TODO Poll DB for message with userID and uniqueRay and then return all the info requested by the frontend

    res.status(201)
    res.send({ 'newOffset' : newOffset, 'gapped_messages' : gap_messages})
})

app.post('/api/replies', async (req, res) => {
    var user = req.cookies.userID;
    if (user === undefined) {
        res.status(401)
        res.send('Unauthorized')
        return
    }
    if(req.cookies.userID==null || req.body.content==null || req.body.message_id==null || req.body.offset==null
        || req.cookies.userID==undefined || req.body.content==undefined || req.body.message_id==undefined || req.body.offset==undefined) {
        res.status(400)
        res.send('Bad request')
        return
    }

    const reply = await Replies.create({
        content: req.body.content,
        upvoteCount: 1,
        user_id: user,
        reply_votes : [{
            status: "U",
            user_id: user,
        }],
        messageID: req.body.message_id,
        messageId: req.body.message_id
    },{
        include: [{
          association:  Replies.ReplyVotes,
          include: [ReplyVotes.Replies]
        }]
      })

    Messages.increment('commentCount', { by: 1, where: { id: req.body.message_id }});

    const gap_replies = await Replies.findAll({
        where: { id: {
            [Op.between]: [Number(req.body.offset)+1, reply.id]
          }, messageId: req.body.message_id },
        order: [['id', 'ASC']],
        include: {
            model: ReplyVotes,
            where: { user_id : user },
            required: false
        }
    });

    var newOffset = req.body.offset
    if(gap_replies.length>0){
        newOffset = gap_replies[gap_replies.length-1].id
    }


    //Emit event to create reply
    let uniqueRay = Math.round(Math.random()*100000000)+''
    emitReplySubmitEvent(req.body.content, user, req.body.message_id, uniqueRay)
    //TODO Poll DB for reply with userID and uniqueRay and then return all the info requested by the frontend
    res.status(201)
    res.send({ 'newOffset' : newOffset, 'gapped_replies' : gap_replies})
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
}

function emitMessageUpvoteEvent(message_id, user_id) {
    console.log("Emitting message upvote event")
    let payload = { 'type' : 'MESSAGE_UPVOTE', 'user' : user_id, 'id' : message_id}
}
function emitMessageDownvoteEvent(message_id, user_id) {
    console.log("Emitting message downvote event")
    let payload = { 'type' : 'MESSAGE_DOWNVOTE', 'user' : user_id, 'id' : message_id}
}
function emitMessageNeutralVoteEvent(message_id, user_id) {
    console.log("Emitting message neutral vote event")
    let payload = { 'type' : 'MESSAGE_NEUTRALVOTE', 'user' : user_id, 'id' : message_id}
}
function emitMessageSubmitEvent(title, content, user_id, ray_id) {
    console.log("Emitting message submit event")
    let payload = { 'type' : 'MESSAGE_SUBMIT', 'user' : user_id, 'title' : title, 'content' : content, 'ray_id': ray_id}
}
function emitReplyUpvoteEvent(reply_id, user_id) {
    console.log("Emitting reply upvote event")
    let payload = { 'type' : 'REPLY_UPVOTE', 'user' : user_id, 'id' : reply_id}
}
function emitReplyDownvoteEvent(reply_id, user_id) {
    console.log("Emitting reply downvote event")
    let payload = { 'type' : 'REPLY_DOWNVOTE', 'user' : user_id, 'id' : reply_id}
}
function emitReplyNeutralVoteEvent(reply_id, user_id) {
    console.log("Emitting reply neutral vote event")
    let payload = { 'type' : 'REPLY_NEUTRALVOTE', 'user' : user_id, 'id' : reply_id}
}
function emitReplySubmitEvent(content, user_id, message_id, ray_id) {
    console.log("Emitting reply submit event")
    let payload = { 'type' : 'REPLY_SUBMIT', 'message' : message_id, 'user' : user_id, 'content' : content, 'ray_id': ray_id}
}

async function populate_db() {
}

