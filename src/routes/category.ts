import express from "express"
import { create_category, update_category,get_all_categories, get_category, delete_category } from "../controllers/categoryController"

const router = express.Router()

router.post('/create-category', create_category)
router.put('/update-category', update_category)
router.get('/get-category/:category_Id', get_category)
router.delete('/delete-category/:category_Id', delete_category)
router.get('/get-all-categories', get_all_categories)
export default router;