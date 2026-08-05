# Alert System Documentation

## Overview

The alert system matches new tenders (licitaciones) and purchase orders (órdenes de compra) to user preferences and sends notifications via email, in-app, or webhook.

## Architecture

### Components

1. **Alert Preferences**: User-defined criteria for matching records
2. **Alert Engine**: Service that matches records to preferences and creates alerts
3. **Celery Tasks**: Background tasks for processing alerts asynchronously
4. **Notification Channels**: Email, in-app, and webhook support

### Database Models

- `User`: User accounts with notification preferences
- `AlertPreference`: User-defined matching criteria
- `Alert`: Created alerts/notifications
- `BuyerOrganization`: Buyer organizations (organismos)
- `Supplier`: Suppliers (proveedores)
- `Category`: CPV/UNSPSC classification categories

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info

### Users

- `GET /api/users/` - List users (admin only)
- `GET /api/users/{user_id}` - Get user by ID
- `PUT /api/users/{user_id}` - Update user
- `DELETE /api/users/{user_id}` - Delete user (admin only)

### Tenders

- `GET /api/tenders/` - List tenders with filtering and pagination
- `GET /api/tenders/{tender_id}` - Get tender by ID
- `GET /api/tenders/codigo/{codigo_externo}` - Get tender by external code

### Alerts

- `POST /api/alerts/preferences` - Create alert preference
- `GET /api/alerts/preferences` - List user's alert preferences
- `GET /api/alerts/preferences/{preference_id}` - Get alert preference
- `PUT /api/alerts/preferences/{preference_id}` - Update alert preference
- `DELETE /api/alerts/preferences/{preference_id}` - Delete alert preference
- `GET /api/alerts/` - List user's alerts
- `GET /api/alerts/{alert_id}` - Get alert by ID
- `PUT /api/alerts/{alert_id}` - Update alert (e.g., mark as read)
- `POST /api/alerts/{alert_id}/read` - Mark alert as read
- `DELETE /api/alerts/{alert_id}` - Delete alert

## Alert Preferences

Alert preferences define matching criteria:

- **Category**: Match by CPV/UNSPSC category
- **Organizations**: Match by buyer organization IDs
- **Amount Range**: Match by minimum/maximum amount
- **Status**: Match by tender/order status
- **Region/Comuna**: Match by location
- **Keywords**: Match by keywords in name/description

## Notification Channels

### Email

Email notifications are sent using the configured email service. To enable:

1. Configure email settings in `app/config.py` or environment variables
2. Implement the `_send_email_notification` method in `AlertEngine`
3. Set `notification_email=True` for users/preferences

### In-App

In-app notifications are automatically created in the database when alerts are matched. Users can retrieve them via the `/api/alerts/` endpoint.

### Webhook

Webhook notifications send HTTP POST requests to user-defined URLs. To enable:

1. Set `notification_webhook=True` for users/preferences
2. Configure `webhook_url` for users or preferences
3. The system will POST JSON payloads to the webhook URL

## Celery Setup

The alert system uses Celery for asynchronous processing:

1. **Celery Worker**: Processes alert matching and notifications
2. **Celery Beat**: Scheduler for periodic tasks (if needed)

### Running Celery

```bash
# Worker
celery -A app.celery_app worker --loglevel=info

# Beat (scheduler)
celery -A app.celery_app beat --loglevel=info
```

### Docker Compose

The `docker-compose.yml` includes:
- `celery_worker`: Celery worker service
- `celery_beat`: Celery beat scheduler service

## Integration with ETL

The ETL loader automatically triggers alerts for new records:

1. When new licitaciones are loaded, `trigger_licitacion_alert()` is called
2. When new órdenes de compra are loaded, `trigger_orden_compra_alert()` is called
3. These functions create Celery tasks to process alerts asynchronously

## Manual Alert Triggering

You can manually trigger alerts using the utility functions:

```python
from app.utils.alert_trigger import trigger_licitacion_alert, trigger_orden_compra_alert

# Trigger alert for a licitacion
trigger_licitacion_alert(licitacion_id=123, use_celery=True)

# Trigger alert for an orden_compra
trigger_orden_compra_alert(orden_compra_id=456, use_celery=True)
```

## Configuration

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string (for Celery)
- `SECRET_KEY`: JWT secret key
- `ACCESS_TOKEN_EXPIRE_MINUTES`: JWT token expiration (default: 30)

### Email Configuration

Add email service configuration to `app/config.py`:

```python
# Email settings
smtp_host: str = "smtp.gmail.com"
smtp_port: int = 587
smtp_user: str = ""
smtp_password: str = ""
smtp_from_email: str = "noreply@example.com"
```

## Database Migrations

Run migrations to create the alert system tables:

```bash
cd backend
alembic upgrade head
```

## Testing

Test the alert system:

1. Create a user and login
2. Create an alert preference with matching criteria
3. Load new tenders/orders via ETL
4. Check alerts via `/api/alerts/` endpoint
5. Verify notifications are sent via configured channels

