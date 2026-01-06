import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { middleware, signupLimiter } from "./middleware";
import { UserSchema, LoginSchema, RoomSchema } from "@repo/common/type";
import { prisma } from "@repo/db";
import bcrypt from "bcrypt";


const app = express();
const PORT = 3001;

app.use(express.json());

app.post("/signup", async (req, res) => {
  const parsed = UserSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input" });
  }

  try {
    const hashed = await bcrypt.hash(parsed.data.password, 12);

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        password: hashed,
      },
    });

    return res.status(201).json({ userId: user.id });
  } catch (e: any) {
    if (e.code === "P2002")
      return res.status(409).json({ message: "user already exist " });

    console.error(e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/signin", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "1d" });

  res.json({ token });
});

app.post("/room", middleware, async (req, res) => {
  const parse = RoomSchema.safeParse(req.body);
  if (!parse.success) {
    return res.json({
      message: "Invalid inputs",
    });
  }

  //@ts-ignore
  const userId = req.userId;

  //db call to create the Room
  try {
    const room = await prisma.room.create({
      data: {
        slug: parse.data.name,
        adminId: userId,
      },
    });

    res.status(201).json({ roomId: room.id });
  } catch (e: any) {
    if (e.code === "P2002") {
      return res.status(409).json({ message: "Room already exists" });
    }
    console.error(e);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/chat/:roomId", async (req, res) => {
  const roomId = Number(req.params.roomId);


  const messages = await prisma.chat.findMany({
    where: {
      roomId,
    },
    orderBy: {
      id: "desc",
    },
    take: 50,
  });
  res.json({
    messages
  })
});

app.get("/room/:slug", async(req, res) => {
  const slug =  req.params.slug;
  
  const room =  await prisma.room.findFirst({
    where:{
      slug
    }
  })
  const roomId = room?.id;

  res.json({
    roomId
  })
})

app.listen(PORT, () => {
  console.log(`HTTP Server listening on port ${PORT}`);
});
