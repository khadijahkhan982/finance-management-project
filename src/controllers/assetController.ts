import { Asset } from "../entities/Asset";
import { Request, Response} from "express";
import { User } from "../entities/User";
import { HttpStatusCode } from "../utils/enums";
import { APIError } from "../errors/api-error";
import { create_json_response, handleError } from "../utils/helper";

interface AuthRequest extends Request {
  authenticatedUserId?: number;
}
//extends request copies body, params and headers so we have the standard features
//before kept getting error: Property 'authenticatedUserId' does not exist on type 'Request'.


 const create_asset = async (req: AuthRequest, res: Response) => {
  const { name, og_cost } = req.body;
  
  if (!name || og_cost === undefined) {
throw new APIError(
        "BadRequestError",
        HttpStatusCode.BAD_REQUEST,
        true,
        "Name and og cost are required",
        "Name and og cost are required"
      );     }

  const authUserId = req.authenticatedUserId; 

  try {
    const user = await User.findOneBy({ id: authUserId });

    if (!user) {
throw new APIError(
        "BadRequestError",
        HttpStatusCode.NOT_FOUND,
        true,
        "Authentication user not found",
        "Authentication user not found"
      );     }
    const asset = Asset.create({
      name,
      original_cost: Number(og_cost),
      current_cost: Number(og_cost),
      user: user, 
    });

    await asset.save();

    return res.status(HttpStatusCode.CREATED).json(
      create_json_response({ asset: {
        id: asset.id,
        name: asset.name,
        current_cost: asset.current_cost,
      }},
       true,
        "Asset created successfully"))
  

  } catch (error: any) {
    return handleError(error, res, "create asset")
  }
};

const update_asset = async (req: AuthRequest, res: Response) => {
  const { id, name } = req.body;
  const authUserId = req.authenticatedUserId; 

  try {
    const asset = await Asset.findOneBy({ 
      id: Number(id), 
      user: { id: authUserId } 
    });

    if (!asset) {
     throw new APIError(
        "BadRequestError",
        HttpStatusCode.NOT_FOUND,
        true,
        "Asset not found",
        "Asset not found"
      ); 
    }
    asset.name = name;
    await asset.save();

    return res.status(HttpStatusCode.OK).json(
      create_json_response({asset}, true, "Asset updated successfully"));

  } catch (error: any) {
    return handleError(error, res, "update")
  }
};
const get_asset = async (req: AuthRequest, res: Response) => {
  const assetId = Number(req.params.assetId);
  const authUserId = req.authenticatedUserId; 
  if (isNaN(assetId)) {
throw new APIError(
        "BadRequestError",
        HttpStatusCode.BAD_REQUEST,
        true,
        "Asset id not valid",
        "Asset id not valid"
      );   }

  try {
    const asset = await Asset.findOne({
      where: { 
        id: assetId, 
        user: { id: authUserId } 
      },
      select: ["id", "name", "original_cost", "current_cost", "created_at"]
    });

    if (!asset) {
       throw new APIError(
        "Notfound",
        HttpStatusCode.NOT_FOUND,
        true,
        "Asset not found or unauthorized",
        "Asset not found or unauthorized"
      ); 
    }

    return res.status(HttpStatusCode.OK).json(create_json_response({ asset },
      true, "Asset retrieved successfully"
    ));

  } catch (error: any) {
   return handleError(error, res, "get asset")
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
    return res.status(HttpStatusCode.OK).json(create_json_response(
      { assets, meta: {
        total_items: total,
        total_pages: Math.ceil(total / pageLimit),
        current_page: pageNum,
        per_page: pageLimit,
        item_count: assets.length
      },},
   true,
      "All assets retrieved successfully"
     )
    );

  } catch (error: any) {
   return handleError(error, res, "get all")
  }
};

const delete_asset = async (req: AuthRequest, res: Response) => {
  const assetId = Number(req.params.assetId);
  const authUserId = req.authenticatedUserId;

  if (isNaN(assetId)) {
throw new APIError(
        "BadRequestError",
        HttpStatusCode.BAD_REQUEST,
        true,
        "Asset id not valid",
        "Asset id not valid"
      );   }

  try {
    
    const asset = await Asset.findOneBy({ 
      id: assetId, 
      user: { id: authUserId } 
    });

    if (!asset) {
     throw new APIError(
        "BadRequestError",
        HttpStatusCode.NOT_FOUND,
        true,
        "Asset not found",
        "Asset not found"
      ); 
    }
    await asset.remove();

    return res.status(HttpStatusCode.OK).json(
      create_json_response( {}, true, "Asset deleted successfully")
    );

  } catch (error: any) {
  return handleError(error, res, "delete")
  }
};


export { create_asset, update_asset, get_asset, get_all_assets, delete_asset };
