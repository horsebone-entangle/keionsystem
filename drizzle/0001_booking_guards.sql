-- Custom SQL migration file, put your code below! --
CREATE TRIGGER reservation_guard BEFORE INSERT ON reservations
BEGIN
  SELECT CASE WHEN NEW.date < date('now','+9 hours') OR NEW.date > date('now','+9 hours','+13 days')
    OR (NEW.reservation_type='personal' AND NEW.date > date('now','+9 hours','+' || (SELECT personal_open_days FROM settings WHERE id=1) || ' days'))
    THEN RAISE(ABORT,'E_DATE_RANGE') END;
  SELECT CASE WHEN NEW.slot_id NOT IN ('p1a','p1b','p2a','p2b','lunch','p3a','p3b','p4a','p4b','p5a','p5b','p6a','p6b')
    OR COALESCE((SELECT is_open FROM room_days WHERE date=NEW.date),1)=0
    OR COALESCE((SELECT is_open FROM room_slots WHERE date=NEW.date AND slot_id=NEW.slot_id),
      EXISTS(SELECT 1 FROM settings, json_each(settings.weekly_open_slots, '$."' || strftime('%w',NEW.date) || '"') WHERE settings.id=1 AND json_each.value=NEW.slot_id))=0
    THEN RAISE(ABORT,'E_ROOM_CLOSED') END;
  SELECT CASE WHEN NEW.reservation_type='band' AND NOT EXISTS(
    SELECT 1 FROM bands JOIN band_members ON band_members.band_id=bands.id WHERE bands.id=NEW.band_id AND bands.status='active' AND band_members.student_id=NEW.student_id)
    THEN RAISE(ABORT,'E_BAND_MEMBER') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM reservations WHERE date=NEW.date AND slot_id=NEW.slot_id AND cancelled_at IS NULL)
    THEN RAISE(ABORT,'E_SLOT_TAKEN') END;
  SELECT CASE WHEN NEW.reservation_type='personal' AND
    (SELECT count(*) FROM reservations WHERE reservation_type='personal' AND student_id=NEW.student_id AND cancelled_at IS NULL AND date>=substr(NEW.date,1,7)||'-01' AND date<date(NEW.date,'start of month','+1 month')) >= (SELECT monthly_personal_limit FROM settings WHERE id=1)
    THEN RAISE(ABORT,'E_MONTHLY_LIMIT') END;
  SELECT CASE WHEN NEW.reservation_type='band' AND
    (SELECT count(*) FROM reservations WHERE reservation_type='band' AND band_id=NEW.band_id AND cancelled_at IS NULL AND date>=substr(NEW.date,1,7)||'-01' AND date<date(NEW.date,'start of month','+1 month')) >= (SELECT monthly_band_limit FROM settings WHERE id=1)
    THEN RAISE(ABORT,'E_MONTHLY_LIMIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER approve_band_request AFTER UPDATE OF status ON band_requests
WHEN NEW.status='approved' AND OLD.status='pending'
BEGIN
  SELECT CASE WHEN NEW.request_type!='create' AND NOT EXISTS(SELECT 1 FROM bands WHERE id=NEW.band_id AND status='active') THEN RAISE(ABORT,'E_REQUEST_INVALID') END;
  SELECT CASE WHEN NEW.request_type!='dissolve' AND (
    json_array_length(NEW.member_entries)=0 OR EXISTS(
      SELECT 1 FROM json_each(NEW.member_entries) e LEFT JOIN members m ON m.student_id=json_extract(e.value,'$.student_id')
      WHERE m.student_id IS NULL OR m.name!=json_extract(e.value,'$.name')))
    THEN RAISE(ABORT,'E_REQUEST_INVALID') END;
  INSERT INTO bands(id,name,status) SELECT NEW.id,NEW.band_name,'active' WHERE NEW.request_type='create';
  DELETE FROM band_members WHERE band_id=NEW.band_id AND NEW.request_type='update_members';
  INSERT INTO band_members(band_id,student_id)
    SELECT CASE WHEN NEW.request_type='create' THEN NEW.id ELSE NEW.band_id END,json_extract(value,'$.student_id')
    FROM json_each(NEW.member_entries) WHERE NEW.request_type IN ('create','update_members');
  UPDATE bands SET status='dissolved' WHERE id=NEW.band_id AND NEW.request_type='dissolve';
  UPDATE reservations SET cancelled_at=NEW.reviewed_at WHERE band_id=NEW.band_id AND NEW.request_type='dissolve' AND cancelled_at IS NULL AND date>=date('now','+9 hours');
END;
