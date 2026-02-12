import express from "express"

import { signup ,delete_user, user_logout, get_user, forgot_password, verify_otp,verifySignup, reset_password,
     resend_token,
     update_user, user_login} from "../controllers/userController"
import { protect } from "../middleware/authMiddleware"; // Must be imported
import { signupSchema } from "../validations/userValidation";
import { validate, validateOwnership } from "../middleware/validation";

const router = express.Router()
router.post('/signup', validate(signupSchema), signup);
router.post('/resend-token', resend_token)
router.post('/logout', protect, user_logout)
router.post('/login', user_login)
router.post('/forgot-password', forgot_password)
router.post('/verify-otp', verify_otp)
router.post('/reset-password', reset_password)
router.post('/verify-signup', verifySignup)

router.get('/get-user', protect, get_user)
router.put('/update-user', protect, update_user)
router.delete('/delete-user', protect, delete_user)
export default router;