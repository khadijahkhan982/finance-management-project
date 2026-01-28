import { User } from "../entities/User";
import { Asset } from "../entities/Asset";
import { AppDataSource } from "../index";
import { Request, Response} from "express";
import { queryRunnerFunc } from "../utils/query_runner";

interface AuthRequest extends Request {
  authenticatedUserId?: number;
}
//extends request copies body, params and headers so we have the standard features
//before kept getting error: Property 'authenticatedUserId' does not exist on type 'Request'.


 const create_asset = async (req: AuthRequest, res: Response) => {
  const { name, og_cost } = req.body;
  
  if (!name || og_cost === undefined) {
    return res.status(400).json({ message: "Name and original cost are required." });
  }

  const authUserId = req.authenticatedUserId; 

  try {
    const user = await User.findOneBy({ id: authUserId });

    if (!user) {
      return res.status(404).json({ message: "Authenticated user not found." });
    }
    const asset = Asset.create({
      name,
      original_cost: Number(og_cost),
      current_cost: Number(og_cost),
      user: user, 
    });

    await asset.save();

    return res.status(201).json({
      success: true,
      message: "Asset created successfully",
      asset: {
        id: asset.id,
        name: asset.name,
        current_cost: asset.current_cost,
      },
    });

  } catch (error) {
    console.error("Error in create_asset:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const update_asset = async (req: AuthRequest, res: Response) => {
  const assetId = Number(req.params.assetId);
  const { name } = req.body;
  const authUserId = req.authenticatedUserId; 

  if (isNaN(assetId)) {
    return res.status(400).json({ message: "Invalid asset ID" });
  }

  if (!name) {
    return res.status(400).json({ message: "Asset name is required." });
  }
  try {
    const asset = await Asset.findOneBy({ 
      id: assetId, 
      user: { id: authUserId } 
    });

    if (!asset) {
      return res.status(404).json({ 
        message: "Asset not found or unauthorized." 
      });
    }
    asset.name = name;
    await asset.save();

    return res.status(200).json({
      message: "Asset updated successfully",
      asset
    });

  } catch (error) {
    console.error("Error in update_asset:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
const get_asset = async (req: AuthRequest, res: Response) => {
  const assetId = Number(req.params.assetId);
  const authUserId = req.authenticatedUserId; 
  if (isNaN(assetId)) {
    return res.status(400).send({ message: "Invalid asset ID" });
  }

  try {
    const asset = await Asset.findOne({
      where: { 
        id: assetId, 
        user: { id: authUserId } 
      },
      select: ["id", "name", "original_cost", "current_cost", "created_at"]
    });

    if (!asset) {
      return res.status(404).json({ 
        message: "Asset not found or unauthorized." 
      });
    }

    return res.status(200).json({ asset });

  } catch (error) {
    console.error("Error in get_asset:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const get_all_assets = async (req: AuthRequest, res: Response) => {
  const { og_min, og_max, page = 1, limit = 10, search } = req.query;
  const authUserId = req.authenticatedUserId;

  const pageNum = Math.max(1, Number(page));
  const pageLimit = Math.max(1, Math.min(Number(limit), 100)); 
  const skip = (pageNum - 1) * pageLimit;

  try {
    const query = Asset.getRepository()
      .createQueryBuilder("asset")
      .where("asset.user_id = :user_id", { user_id: authUserId });

    if (search) {
      query.andWhere("asset.name ILIKE :search", { search: `%${search}%` });
    }

    if (og_min && og_max) {
      query.andWhere("asset.current_cost BETWEEN :min AND :max", { 
        min: Number(og_min), 
        max: Number(og_max) 
      });
    } else if (og_min) {
      query.andWhere("asset.current_cost >= :min", { min: Number(og_min) });
    }
    query.select([
        "asset.id",
        "asset.name",
        "asset.original_cost",
        "asset.current_cost",
        "asset.created_at"
      ])
      .orderBy("asset.created_at", "DESC") 
      .skip(skip)
      .take(pageLimit);

    const [assets, total] = await query.getManyAndCount();
    return res.status(200).json({
      success: true,
      meta: {
        total_items: total,
        total_pages: Math.ceil(total / pageLimit),
        current_page: pageNum,
        per_page: pageLimit,
        item_count: assets.length
      },
      assets,
    });

  } catch (error) {
    console.error("Error in get_all_assets:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const delete_asset = async (req: AuthRequest, res: Response) => {
  const assetId = Number(req.params.assetId);
  const authUserId = req.authenticatedUserId;

  if (isNaN(assetId)) {
    return res.status(400).send({ message: "Invalid asset ID" });
  }

  try {
    
    const asset = await Asset.findOneBy({ 
      id: assetId, 
      user: { id: authUserId } 
    });

    if (!asset) {
      return res.status(404).json({ 
        message: "Asset not found or unauthorized." 
      });
    }
    await asset.remove();

    return res.status(200).json({
      success: true,
      message: "Asset deleted successfully."
    });

  } catch (error) {
    console.error("Error in deleting asset:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


export { create_asset, update_asset, get_asset, get_all_assets, delete_asset };
