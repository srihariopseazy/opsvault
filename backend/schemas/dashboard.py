from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_items: int
    logins: int
    notes: int
    cards: int
    identities: int
    favorites: int
    trash: int
