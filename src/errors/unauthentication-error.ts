import {HttpStatusCode} from "../utils/enums";
import { APIError } from "./api-error";

export class UnauthenticatedError extends APIError {
    public status_code: Number;
    constructor(message: string) {
      super("UnauthenticatedError", HttpStatusCode.UNAUTHORIZED, true, "UnauthenticatedError",message);
      this.status_code = HttpStatusCode.UNAUTHORIZED;
    }
}
