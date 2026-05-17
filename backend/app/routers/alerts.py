from fastapi import APIRouter, HTTPException
from app.models.schemas import Alert

router = APIRouter()

_alerts: list[Alert] = []
_next_id = 1


@router.get("/", response_model=list[Alert])
def get_alerts():
    return _alerts


@router.post("/", response_model=Alert)
def create_alert(alert: Alert):
    global _next_id
    alert.id = _next_id
    _next_id += 1
    _alerts.append(alert)
    return alert


@router.delete("/{alert_id}")
def delete_alert(alert_id: int):
    global _alerts
    before = len(_alerts)
    _alerts = [a for a in _alerts if a.id != alert_id]
    if len(_alerts) == before:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"deleted": alert_id}
