import { z} from 'zod';


export const UserSchema =  z.object({
    name: z.string().min(3).max(50),
    email: z.email(),
    password: z.string().min(5).max(50)
})

export const LoginSchema = z.object({
    email: z.email(),
    password: z.string().min(5).max(50)
})

export const RoomSchema =  z.object({
    name: z.string().min(2).max(20),
   
})