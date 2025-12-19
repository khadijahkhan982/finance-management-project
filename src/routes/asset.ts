import express from "express"
import { create_asset, update_asset, get_asset , delete_asset,get_all_assets} from "../controllers/assetController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router()

router.post('/create-asset', protect,create_asset)
router.put('/update-asset/:assetId', protect, update_asset)
router.get('/get-asset/:assetId', protect, get_asset)
router.get('/get-all-assets', protect, get_all_assets)
router.delete('/delete-asset/:assetId', protect, delete_asset);
export default router;