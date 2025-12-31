import { z} from 'zod';


export const UserSchema =  z.object({
    name: z.string().min(3).max(50),
    email: z.email(),
    username:z.string().min(5).max(20),
    password: z.string().min(8).max(50).regex(/[A-Z]/).regex(/[0-9]/)
})

export const LoginSchema = z.object({
    username: z.string().min(3).max(20),
    password: z.string().min(8).max(20)
})

export const RoomSchema =  z.object({
    name: z.string().min(2).max(20)
})