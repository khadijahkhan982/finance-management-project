import { HttpStatusCode } from "../utils/enums";
import { BaseError } from "./base-error";

export class APIError extends BaseError {
  public readonly user_description: string;

  constructor(name: string, httpCode = HttpStatusCode.INTERNAL_SERVER, isOperational = true, description = 'internal server error', user_description='internal server error') {
    super(name, httpCode, isOperational, description);
    this.user_description = user_description;
  }
}