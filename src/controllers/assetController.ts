import express from "express";
import { User } from "../entities/User";
import { Asset } from "../entities/Asset";
import { logger } from "../utils/logger";
import { decrypt_Token } from "../utils/authHelpers";
import { Between } from "typeorm";
import { MoreThanOrEqual } from "typeorm";

const create_asset = async (req: express.Request, res: express.Response) => {
  const { name, og_cost } = req.body;
  let token = "";

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  const authenticatedUserId = (req as any).authenticatedUserId;

  if (!authenticatedUserId || !token) {
    return res
      .status(401)
      .send({ message: "Authentication required (Token missing)." });
  }

  try {
    const user = await User.getRepository().findOneBy({
      id: authenticatedUserId,
    });

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    try {
      decrypt_Token(token);
    } catch (e) {
      return res
        .status(400)
        .send({ message: "Invalid JWT token signature or format." });
    }

    const sentToken = String(token).trim();
    const storedToken = user.token ? String(user.token).trim() : null;

    if (!storedToken || storedToken !== sentToken) {
      return res.status(401).send({
        message: "Invalid token (Database mismatch). Access denied.",
      });
    }

    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      return res
        .status(401)
        .send({ message: "Your session/token has expired." });
    }
    const asset = Asset.create({
      name,
      original_cost: Number(og_cost),
      current_cost: Number(og_cost),
      user: user,
    });

    await asset.save();

    return res.status(201).send({
      message: "Asset created successfully",
      asset: {
        id: asset.id,
        name: asset.name,
        current_cost: asset.current_cost,
      },
    });
  } catch (error) {
    logger.error("Error in create_asset:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
};

const update_asset = async (req: express.Request, res: express.Response) => {
  const assetId = Number(req.params.assetId);
  const { name } = req.body;
  let token = "";

  if (isNaN(assetId)) {
    return res.status(400).send({ message: "Invalid asset ID" });
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  const authenticatedUserId = (req as any).authenticatedUserId;

  if (!authenticatedUserId || !token) {
    return res.status(401).send({ message: "Authentication required." });
  }

  try {
    const user = await User.getRepository().findOneBy({
      id: authenticatedUserId,
    });

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    try {
      decrypt_Token(token);
    } catch (e) {
      return res.status(400).send({ message: "Invalid token signature." });
    }

    const sentToken = String(token).trim();
    const storedToken = user.token ? String(user.token).trim() : null;

    if (!storedToken || storedToken !== sentToken) {
      return res
        .status(401)
        .send({ message: "Invalid or expired session token." });
    }

    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      return res.status(401).send({ message: "Token has expired." });
    }
    const asset = await Asset.findOne({
      where: {
        id: assetId,
        user: { id: user.id },
      },
    });

    if (!asset) {
      return res
        .status(404)
        .send({ message: "Asset not found or access denied." });
    }
    if (name) {
      asset.name = name;
    } else {
      return res
        .status(400)
        .send({ message: "No valid fields provided for update." });
    }

    await asset.save();

    return res.send({
      message: "Asset name updated successfully",
      asset: {
        id: asset.id,
        name: asset.name,
        current_cost: asset.current_cost,
      },
    });
  } catch (error) {
    logger.error("Error in update_asset:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
};

const get_asset = async (req: express.Request, res: express.Response) => {
  const assetId = Number(req.params.assetId);
  let token = "";

  if (isNaN(assetId)) {
    return res.status(400).send({ message: "Invalid asset ID" });
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  const authenticatedUserId = (req as any).authenticatedUserId;

  if (!authenticatedUserId || !token) {
    return res.status(401).send({ message: "Authentication required." });
  }

  try {
    const user = await User.getRepository().findOneBy({
      id: authenticatedUserId,
    });

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    try {
      decrypt_Token(token);
    } catch (e) {
      return res.status(400).send({ message: "Invalid token signature." });
    }

    const sentToken = String(token).trim();
    const storedToken = user.token ? String(user.token).trim() : null;

    if (!storedToken || storedToken !== sentToken) {
      return res.status(401).send({ message: "Invalid session token." });
    }

    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      return res.status(401).send({ message: "Token has expired." });
    }

    const asset = await Asset.findOne({
      where: {
        id: assetId,
        user: { id: user.id },
      },
    });

    if (!asset) {
      return res
        .status(404)
        .send({ message: "Asset not found or you do not have access." });
    }

    return res.status(200).send({ asset });
  } catch (error) {
    logger.error("Error in get_asset:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
};

const get_all_assets = async (req: express.Request, res: express.Response) => {
  let token = "";
  const { og_cost, curr_cost, page = 1, limit = 10 } = req.query;

  const p = Number(page) || 1;
  const l = Number(limit) || 10;
  const skip = (p - 1) * l;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }
  const authenticatedUserId = (req as any).authenticatedUserId;

  if (!authenticatedUserId || !token) {
    return res.status(401).send({ message: "Authentication required." });
  }

  try {
    const user = await User.getRepository().findOneBy({
      id: authenticatedUserId,
    });
    if (!user) return res.status(404).send({ message: "User not found." });

    try {
      decrypt_Token(token);
    } catch (e) {
      return res.status(400).send({ message: "Invalid token signature." });
    }

    const sentToken = String(token).trim();
    const storedToken = user.token ? String(user.token).trim() : null;
    if (!storedToken || storedToken !== sentToken) {
      return res
        .status(401)
        .send({ message: "Invalid session token mismatch." });
    }

    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      return res.status(401).send({ message: "Token has expired." });
    }

    let whereConditions: any = { user: { id: user.id } };

    if (og_cost && curr_cost) {
      whereConditions.current_cost = Between(
        Number(og_cost),
        Number(curr_cost)
      );
    } else if (og_cost) {
      whereConditions.current_cost = MoreThanOrEqual(Number(og_cost));
    }

    const [assets, total] = await Asset.findAndCount({
      where: whereConditions,
      relations: ["user"],
      order: { id: "ASC" },
      take: l,
      skip: skip,
    });

    return res.status(200).send({
      count: assets.length,
      meta: {
        total_items: total,
        total_pages: Math.ceil(total / l),
        current_page: p,
        per_page: l,
      },
      assets,
    });
  } catch (error) {
    logger.error("Error in get_all_assets:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
};

const delete_asset = async (req: express.Request, res: express.Response) => {
  const assetId = Number(req.params.assetId);
  let token = "";

  if (isNaN(assetId)) {
    return res.status(400).send({ message: "Invalid asset ID" });
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  const authenticatedUserId = (req as any).authenticatedUserId;

  if (!authenticatedUserId || !token) {
    return res.status(401).send({ message: "Authentication required." });
  }

  try {
    const user = await User.getRepository().findOneBy({
      id: authenticatedUserId,
    });

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }
    try {
      decrypt_Token(token);
    } catch (e) {
      return res.status(400).send({ message: "Invalid token signature." });
    }

    const sentToken = String(token).trim();
    const storedToken = user.token ? String(user.token).trim() : null;

    if (!storedToken || storedToken !== sentToken) {
      return res
        .status(401)
        .send({ message: "Invalid session token mismatch." });
    }

    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      return res.status(401).send({ message: "Token has expired." });
    }
    const asset = await Asset.findOne({
      where: {
        id: assetId,
        user: { id: user.id },
      },
    });

    if (!asset) {
      return res
        .status(404)
        .send({
          message:
            "Asset not found or you do not have permission to delete it.",
        });
    }
    await asset.remove();

    return res.status(200).send({
      message: "Asset deleted successfully.",
    });
  } catch (error) {
    logger.error("Error in delete_asset:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
};
export { create_asset, update_asset, get_asset, get_all_assets, delete_asset };
