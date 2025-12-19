import express from "express"

import { signup, user_auth ,delete_user, user_logout, get_user, resend_token, update_user} from "../controllers/userController"
import { protect } from "../middleware/authMiddleware"; // Must be imported

const router = express.Router()
router.post('/signup', signup, (req, res) => {
  
    const user = res.locals.user;
    return res.status(201).send({
        message: "User created. Verification token sent.",
        user: { id: user.id, email: user.email },
    });
});
router.post('/verify-user', user_auth)
router.post('/resend-token', resend_token)
router.post('/logout/:userId', protect, user_logout)
router.get('/user/:userId', protect, get_user)
router.put('/user/:userId', protect, update_user)
router.delete('/user/:userId', protect, delete_user)

export default router;