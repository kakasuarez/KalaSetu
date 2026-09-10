from app.services.pricing import PricingEngine


def test_price_estimate_includes_fair_wage_floor():
	result = PricingEngine.load().predict(
		facts={"work_hours": 8, "material_cost": 200}, state="UP"
	)

	assert result.dignity_floor in (804, 805)
	assert result.recommended >= result.dignity_floor
	assert result.low >= result.dignity_floor
	assert result.floor_breached is True


def test_price_estimate_degrades_when_facts_are_missing():
	result = PricingEngine.load().predict(facts={})

	assert result.recommended > 0
	assert result.missing_facts == ["work_hours", "material_cost"]
	assert result.confidence < 1
