from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import Alert as AlertRow
from app.models.schemas import Alert

router = APIRouter()


@router.get("/", response_model=list[Alert])
def get_alerts(db: Session = Depends(get_db)):
    rows = db.query(AlertRow).order_by(AlertRow.id.desc()).all()
    return [_to_schema(r) for r in rows]


@router.post("/", response_model=Alert)
def create_alert(alert: Alert, db: Session = Depends(get_db)):
    row = AlertRow(
        ticker=alert.ticker.upper(),
        alert_type=alert.alert_type,
        threshold=alert.threshold,
        metric=alert.metric,
        active=alert.active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_schema(row)


@router.patch("/{alert_id}/toggle", response_model=Alert)
def toggle_alert(alert_id: int, db: Session = Depends(get_db)):
    row = db.query(AlertRow).filter(AlertRow.id == alert_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Alert not found")
    row.active = not row.active
    db.commit()
    db.refresh(row)
    return _to_schema(row)


@router.delete("/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    row = db.query(AlertRow).filter(AlertRow.id == alert_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(row)
    db.commit()
    return {"deleted": alert_id}


def _to_schema(row: AlertRow) -> Alert:
    return Alert(
        id=row.id,
        ticker=row.ticker,
        alert_type=row.alert_type,
        threshold=row.threshold,
        metric=row.metric,
        active=row.active,
        triggered_at=row.triggered_at.isoformat() if row.triggered_at else None,
    )
