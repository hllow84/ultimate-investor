from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import User
from app.models.schemas import Token, UserCreate, UserResponse
from app.services.auth_service import create_access_token, hash_password, verify_password

router = APIRouter()


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(body: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=body.email.lower(), hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return Token(
        access_token=create_access_token(user.id),
        user=UserResponse(id=user.id, email=user.email),
    )


@router.post("/login", response_model=Token)
def login(body: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return Token(
        access_token=create_access_token(user.id),
        user=UserResponse(id=user.id, email=user.email),
    )
