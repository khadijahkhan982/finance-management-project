import express from "express";
import { Category } from "../entities/Category";

const router = express.Router();


const create_category = async(req: any, res: any, next: any)=>{
    const {name, type} = req.body;
    try{
        const category = Category.create({
            name, type
        })
        await category.save();
        console.log("Category created:", category);
        res.locals.category = category;
        return next();
    } catch (error) {
        console.error("Error creating category:", error);
        return res.status(500).send({ message: "Internal Server Error" });
    }
}


const update_category = async(req: any, res: any, next: any)=>{
    const categoryId = Number(req.params.category_Id);
    if(isNaN(categoryId)){
        return res.status(400).send({message: "Invalid category ID"});
    }
    try{
        const category = await Category.getRepository()
    .findOneBy({id: categoryId});
    if (!category){
        return res.status(404).send({message: "Category not found"});
    }
    const {name, type} = req.body;
    const updates: any = {};
    if(name) updates.name = name;
    if(type) updates.type = type;
     if (Object.keys(updates).length === 0) {
      return res.status(400).send({ message: "No valid fields to update." });
    }
    await Category.getRepository().update({id: categoryId}, updates);
    return res.status(200).send({message: "Category updated successfully"});
} catch (err){
    console.error(err)
    return res.status(500).send({message: "Internal Server Error"});
}

}
   
const get_category = async(req: any, res: any, next: any)=>{
    const categoryId = Number(req.params.category_Id);
    if(isNaN(categoryId)){
        return res.status(400).send({message: "Invalid category ID"});
    }

    try{
        const existing_category = await Category.getRepository()
        .findOne({
            select: ['id', 'name', 'type'],
            where: {id: categoryId}

        });
        if (!existing_category) {
            return res.status(404).json({message: "Category not found"});
        }
        return res.status(200).send(existing_category);
    } catch (err) {
        console.error(err);
        return res.status(500).send({message: "Internal Server Error"});
    }
}


const get_all_categories = async (req: express.Request, res: express.Response) => {
    const { type, page = 1, limit = 2 } = req.query;
    
    const p = Number(page);
    const l = Number(limit);
    const skip = (p - 1) * l;

    try {
        let whereConditions: any = {};

        if (type) {
            whereConditions.type = type;
        }
        const [categories, total] = await Category.findAndCount({
            where: whereConditions,
            select: ['id', 'name', 'type'], 
            order: { name: "ASC" },
            take: l,
            skip: skip
        });
        return res.status(200).send({ 
            current_page_count: categories.length, 
            categories,
            meta: {
                total_items: total, 
                total_pages: Math.ceil(total / l),
                current_page: p,
                per_page: l
            }
        });

    } catch (error) {
        console.error("Error in get_all_categories:", error);
        return res.status(500).send({ message: "Internal Server Error" });
    }
};

const delete_category = async(req: any, res: any, next: any)=>{
     const categoryId = Number(req.params.category_Id);
    if(isNaN(categoryId)){
        return res.status(400).send({message: "Invalid category ID"});
    }
    try{
        const category = await Category.getRepository()
        .findOneBy({id: categoryId});
        if (!category){
            return res.status(404).send({message: "Category not found"});
        }
        await Category.getRepository().delete({id: categoryId});
        return res.status(200).send({message: "Category deleted successfully"});
    } catch (err){
        console.error(err);
        return res.status(500).send({message: "Internal Server Error"});
    }
}



export {create_category, update_category, get_category, get_all_categories,delete_category};