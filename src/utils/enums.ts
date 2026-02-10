export enum Status {
    is_active = "active",
    is_inactive = "inactive"
}




export enum TransactionType {

    deposit = "deposit",
    withdrawal = "withdrawal"


}


export enum HttpStatusCode {
    OK = 200,
    CREATED = 201,
    BAD_REQUEST = 400,
    NOT_FOUND = 404,
    INTERNAL_SERVER = 500,
    UNAUTHORIZED = 401,
    UNPROCESSABLE_ENTITY = 422,
    CONFLICT = 409
}