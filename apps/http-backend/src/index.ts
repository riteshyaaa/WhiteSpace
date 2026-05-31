import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { middleware, signupLimiter } from "./middleware";
import { UserSchema, LoginSchema, RoomSchema } from "@repo/common/type";
import { prisma } from "@repo/db";
import bcrypt from "bcrypt";
import cors from "cors"


const app = express();

// Restrict CORS to the configured frontend origin instead of allowing all.
const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(cors({ origin: allowedOrigin, credentials: true }));

const PORT = 3001;

app.use(express.json());

app.post("/signup", signupLimiter, async (req, res) => {
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

app.get("/me", middleware, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(403).json({ message: "unauthorized" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({ user });
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "board"}-${suffix}`;
}

app.post("/room", middleware, async (req, res) => {
  const parse = RoomSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: "Invalid inputs" });
  }

  const userId = req.userId;
  if (!userId) {
    return res.status(403).json({ message: "unauthorized" });
  }

  // Generate a unique slug, retrying on the rare collision.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const room = await prisma.room.create({
        data: {
          slug: slugify(parse.data.name),
          name: parse.data.name,
          adminId: userId,
        },
      });
      return res.status(201).json({ roomId: room.id, slug: room.slug });
    } catch (e: any) {
      if (e.code === "P2002") continue; // slug clash — try again
      console.error(e);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
  return res.status(409).json({ message: "Could not generate a unique board" });
});

app.get("/rooms", middleware, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(403).json({ message: "unauthorized" });
  }
  const rooms = await prisma.room.findMany({
    where: { adminId: userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true, name: true, createdAt: true },
  });
  res.json({ rooms });
});

app.delete("/room/:id", middleware, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(403).json({ message: "unauthorized" });
  }
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) {
    return res.status(404).json({ message: "Board not found" });
  }
  if (room.adminId !== userId) {
    return res.status(403).json({ message: "Not your board" });
  }
  await prisma.room.delete({ where: { id } });
  res.status(204).end();
});

app.get("/chat/:roomId", middleware, async (req, res) => {
  const roomId = Number(req.params.roomId);


  const messages = await prisma.chat.findMany({
    where: {
      roomId,
    },
    orderBy: {
      id: "asc",
    },
    take: 2000,
  });
  res.json({
    messages
  })
});

app.get("/room/:slug", middleware, async(req, res) => {
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
