import { User } from "../entities/User";
import { Asset } from "../entities/Asset";
import { AppDataSource } from "../index";
import { Request, Response} from "express";

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

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
   
    const user = await queryRunner.manager.findOneBy(User, { id: authUserId });

    if (!user) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ message: "Authenticated user not found." });
    }
    const asset = queryRunner.manager.create(Asset, {
      name,
      original_cost: Number(og_cost),
      current_cost: Number(og_cost),
      user: user, 
    });

    await queryRunner.manager.save(asset);
    await queryRunner.commitTransaction();

    return res.status(201).json({
      message: "Asset created successfully",
      asset: {
        id: asset.id,
        name: asset.name,
        current_cost: asset.current_cost,
      },
    });

  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("Error in create_asset:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
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
    return res.status(400).json({ message: "Asset name is required for update." });
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
  
    const updateResult = await queryRunner.manager
      .createQueryBuilder()
      .update(Asset)
      .set({ name: name })
      .where("id = :id AND user_id = :user_id", { 
        id: assetId, 
        user_id: authUserId 
      })
      .execute();
    if (updateResult.affected === 0) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ 
        message: "Asset not found or you do not have permission to edit it." 
      });
    }
    await queryRunner.commitTransaction();

    return res.status(200).json({
      message: "Asset updated successfully",
      assetId
    });

  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("Error in update_asset:", error);
    return res.status(500).json({ message: "Internal Server Error" });

  } finally {
    await queryRunner.release();
  }
};
const get_asset = async (req: AuthRequest, res: Response) => {
  const assetId = Number(req.params.assetId);
    const authUserId = req.authenticatedUserId; 
  if (isNaN(assetId)) {
    return res.status(400).send({ message: "Invalid asset ID" });
  }
  try {
    const asset = await Asset.getRepository()
      .createQueryBuilder("asset")
      .where("asset.id = :id AND asset.user_id = :user_id", { 
        id: assetId, 
        user_id: authUserId 
      })
      .select([
        "asset.id",
        "asset.name",
        "asset.original_cost",
        "asset.current_cost",
        "asset.created_at"
      ])
      .getOne();
    if (!asset) {
      return res.status(404).json({ 
        message: "Asset not found or you do not have permission to view it." 
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
    query
      .select([
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

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const deleteResult = await queryRunner.manager
      .createQueryBuilder()
      .delete()
      .from(Asset)
      .where("id = :id AND user = :userId", { 
        id: assetId, 
        userId: authUserId 
      })
      .execute();

    if (deleteResult.affected === 0) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ 
        message: "Asset not found or you do not have permission to delete it." 
      });
    }
  await queryRunner.commitTransaction();

    return res.status(200).json({
      message: "Asset deleted successfully."
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("Error in delete_asset:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};
export { create_asset, update_asset, get_asset, get_all_assets, delete_asset };
