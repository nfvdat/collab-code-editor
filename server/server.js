const app = require('express')()
const http = require('http')
const { Server } = require('socket.io')
const cors = require("cors")

app.use(cors())

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

app.get('/', function (req, res) {
  res.send('Hello from the server!')
})

const socketIDToUsers = {}
const roomIDToCode = {}

async function getUsersInRoom(roomId, io) {
  const socketList = await io.in(roomId).allSockets()
  const userslist = []
  socketList.forEach((each => {
    (each in socketIDToUsers) && userslist.push(socketIDToUsers[each].username)
  }))

  return userslist
}

async function updateUserslistAndCodeMap(io, socket, roomId) {
  socket.in(roomId).emit("member left", { username: socketIDToUsers[socket.id].username })

  // Update the user list
  delete socketIDToUsers[socket.id]
  const userslist = await getUsersInRoom(roomId, io)
  socket.in(roomId).emit("updating client list", { userslist: userslist })

  userslist.length === 0 && delete roomIDToCode[roomId]
}

io.on('connection', function (socket) {
  console.log('A user connected', socket.id)

  socket.on("when a user joins", async ({ roomId, username }) => {
    console.log("username: ", username)
    socketIDToUsers[socket.id] = { username }
    socket.join(roomId)

    const userslist = await getUsersInRoom(roomId, io)

    // Update the client list for other users
    socket.in(roomId).emit("updating client list", { userslist: userslist })

    // Update the client list for this user
    io.to(socket.id).emit("updating client list", { userslist: userslist })

    // Send the latest code changes to this user when joined to existing room
    if (roomId in roomIDToCode) {
      io.to(socket.id).emit("on language change", { languageUsed: roomIDToCode[roomId].languageUsed })
      io.to(socket.id).emit("on code change", { code: roomIDToCode[roomId].code })
    }

    // Alert other users in room that new user joined
    socket.in(roomId).emit("new member joined", {
      username
    })
  })

  // For other users in room to view the changes
  socket.on("update language", ({ roomId, languageUsed }) => {
    if (roomId in roomIDToCode) {
      roomIDToCode[roomId]['languageUsed'] = languageUsed
    } else {
      roomIDToCode[roomId] = { languageUsed }
    }
  })

  socket.on("syncing the language", ({ roomId }) => {
    if (roomId in roomIDToCode) {
      socket.in(roomId).emit("on language change", { languageUsed: roomIDToCode[roomId].languageUsed })
    }
  })

  socket.on("update code", ({ roomId, code }) => {
    if (roomId in roomIDToCode) {
      roomIDToCode[roomId]['code'] = code
    } else {
      roomIDToCode[roomId] = { code }
    }
  })

  socket.on("syncing the code", ({ roomId }) => {
    if (roomId in roomIDToCode) {
      socket.in(roomId).emit("on code change", { code: roomIDToCode[roomId].code })
    }
  })

  socket.on("leave room", ({ roomId }) => {
    socket.leave(roomId)
    updateUserslistAndCodeMap(io, socket, roomId)
  })

  socket.on("disconnecting", (reason) => {
    socket.rooms.forEach(eachRoom => {
      if (eachRoom in roomIDToCode) {
        updateUserslistAndCodeMap(io, socket, eachRoom)
      }
    })
  })

  socket.on('disconnect', function () {
    console.log('A user disconnected')
  })
})

const PORT = process.env.PORT || 5000

server.listen(PORT, function () {
  console.log(`listening on port : ${PORT}`)
})
