export interface LoginRequest{
    username: string;
    password: string;
}

export interface LoginResponse{
    token: string;
    username: string;
    expiryDate: string;
}

export interface ErrorResponse{
    username: string;
    password: string;
}