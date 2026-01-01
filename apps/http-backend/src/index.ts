import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { middleware, signupLimiter } from "./middleware";
import { UserSchema, LoginSchema, RoomSchema } from "@repo/common/type";
  import  {prisma}  from "@repo/db";
import bcrypt from "bcrypt";

const app = express();
const PORT = 3001;

app.use(express.json());

app.post("/signup", async (req, res) => {
  const parsed = UserSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid input" });

  const email = parsed.data.email.toLowerCase().trim();

  try {
    const hashed = await bcrypt.hash(parsed.data.password, 12);

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        password: hashed,
      },
    });

    return res.status(201).json({ userId: user.id });
  } catch (e: any) {
    if (e.code === "P2002")
      return res.status(409).json({ message: "Invalid credentials" });

    console.error(e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/signin", (req, res) => {
  const data = LoginSchema.safeParse(req.body);
  if (!data.success) {
    return res.json({
      message: "Invalid inputs",
    });
  }
  
  const userId = 1;
  const token = jwt.sign(
    {
      userId,
    },
    JWT_SECRET
  );
  res.json({
    token,
  });
});
app.post("/room", middleware, (req, res) => {
  const data = RoomSchema.safeParse(req.body);
  if (!data.success) {
    return res.json({
      message: "Invalid inputs",
    });
  }
  //db call
  res.json({
    roomId: 123,
  });
});

app.listen(PORT, () => {
  console.log(`HTTP Server listening on port ${PORT}`);
});
