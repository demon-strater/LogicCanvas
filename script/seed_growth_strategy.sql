DO $$
DECLARE
  growth_strategy_id integer;
  marketing_engine_id integer;
  performance_optimization_id integer;
  sales_pipeline_id integer;
  brand_awareness_id integer;
BEGIN
  SELECT id INTO growth_strategy_id
  FROM document_groups
  WHERE name = '성장 전략 실행' AND parent_id IS NULL
  LIMIT 1;

  IF growth_strategy_id IS NULL THEN
    INSERT INTO document_groups (
      name, description, parent_id, x, y, manual_width, manual_height, color, month_start, month_end
    ) VALUES (
      '성장 전략 실행',
      '4월부터 6월까지 성장 전략 실행을 관리하는 대그룹',
      NULL, 4550, 900, 2100, 260, '#2563eb', 4, 6
    )
    RETURNING id INTO growth_strategy_id;
  ELSE
    UPDATE document_groups
    SET description = '4월부터 6월까지 성장 전략 실행을 관리하는 대그룹',
        x = 4550,
        y = 900,
        manual_width = 2100,
        manual_height = 260,
        color = '#2563eb',
        month_start = 4,
        month_end = 6
    WHERE id = growth_strategy_id;
  END IF;

  SELECT id INTO marketing_engine_id
  FROM document_groups
  WHERE name = '마케팅 엔진 구축' AND parent_id IS NULL
  LIMIT 1;

  IF marketing_engine_id IS NULL THEN
    INSERT INTO document_groups (
      name, description, parent_id, x, y, manual_width, manual_height, color, month_start, month_end
    ) VALUES (
      '마케팅 엔진 구축',
      '마케팅 실행 체계를 구축하고 성과를 확장하는 대그룹',
      NULL, 4950, 1350, 2900, 900, '#0891b2', 4, 7
    )
    RETURNING id INTO marketing_engine_id;
  ELSE
    UPDATE document_groups
    SET description = '마케팅 실행 체계를 구축하고 성과를 확장하는 대그룹',
        x = 4950,
        y = 1350,
        manual_width = 2900,
        manual_height = 900,
        color = '#0891b2',
        month_start = 4,
        month_end = 7
    WHERE id = marketing_engine_id;
  END IF;

  SELECT id INTO performance_optimization_id
  FROM document_groups
  WHERE name = '퍼포먼스 마케팅 최적화' AND parent_id = marketing_engine_id
  LIMIT 1;

  IF performance_optimization_id IS NULL THEN
    INSERT INTO document_groups (
      name, description, parent_id, x, y, manual_width, manual_height, color, month_start, month_end
    ) VALUES (
      '퍼포먼스 마케팅 최적화',
      '5월부터 6월까지 퍼포먼스 마케팅을 개선하고 성과를 검증',
      marketing_engine_id, 4950, 1260, 1500, 320, '#16a34a', 5, 6
    )
    RETURNING id INTO performance_optimization_id;
  ELSE
    UPDATE document_groups
    SET description = '5월부터 6월까지 퍼포먼스 마케팅을 개선하고 성과를 검증',
        x = 4950,
        y = 1260,
        manual_width = 1500,
        manual_height = 320,
        color = '#16a34a',
        month_start = 5,
        month_end = 6
    WHERE id = performance_optimization_id;
  END IF;

  SELECT id INTO sales_pipeline_id
  FROM document_groups
  WHERE name = '영업 파이프라인 관리' AND parent_id = marketing_engine_id
  LIMIT 1;

  IF sales_pipeline_id IS NULL THEN
    INSERT INTO document_groups (
      name, description, parent_id, x, y, manual_width, manual_height, color, month_start, month_end
    ) VALUES (
      '영업 파이프라인 관리',
      '5월 영업 파이프라인 운영 현황과 관리 체계 정리',
      marketing_engine_id, 4550, 1640, 760, 300, '#f59e0b', 5, 5
    )
    RETURNING id INTO sales_pipeline_id;
  ELSE
    UPDATE document_groups
    SET description = '5월 영업 파이프라인 운영 현황과 관리 체계 정리',
        x = 4550,
        y = 1640,
        manual_width = 760,
        manual_height = 300,
        color = '#f59e0b',
        month_start = 5,
        month_end = 5
    WHERE id = sales_pipeline_id;
  END IF;

  SELECT id INTO brand_awareness_id
  FROM document_groups
  WHERE name = '브랜드 인지도 확산' AND parent_id = marketing_engine_id
  LIMIT 1;

  IF brand_awareness_id IS NULL THEN
    INSERT INTO document_groups (
      name, description, parent_id, x, y, manual_width, manual_height, color, month_start, month_end
    ) VALUES (
      '브랜드 인지도 확산',
      '6월부터 7월까지 브랜드 인지도 확산 활동과 결과 정리',
      marketing_engine_id, 5750, 2020, 1500, 320, '#db2777', 6, 7
    )
    RETURNING id INTO brand_awareness_id;
  ELSE
    UPDATE document_groups
    SET description = '6월부터 7월까지 브랜드 인지도 확산 활동과 결과 정리',
        x = 5750,
        y = 2020,
        manual_width = 1500,
        manual_height = 320,
        color = '#db2777',
        month_start = 6,
        month_end = 7
    WHERE id = brand_awareness_id;
  END IF;

  IF EXISTS (SELECT 1 FROM documents WHERE title = '퍼포먼스 마케팅 최적화 보고서1') THEN
    UPDATE documents
    SET content = '5월 퍼포먼스 마케팅 최적화 실행 내용과 초기 성과를 정리한 보고서입니다.',
        summary = '5월 퍼포먼스 마케팅 최적화 보고서',
        group_id = performance_optimization_id,
        x = 4550,
        y = 1260,
        created_at = '2026-05-15 09:00:00+00',
        updated_at = '2026-05-15 09:00:00+00'
    WHERE title = '퍼포먼스 마케팅 최적화 보고서1';
  ELSE
    INSERT INTO documents (title, content, summary, group_id, x, y, created_at, updated_at)
    VALUES (
      '퍼포먼스 마케팅 최적화 보고서1',
      '5월 퍼포먼스 마케팅 최적화 실행 내용과 초기 성과를 정리한 보고서입니다.',
      '5월 퍼포먼스 마케팅 최적화 보고서',
      performance_optimization_id, 4550, 1260, '2026-05-15 09:00:00+00', '2026-05-15 09:00:00+00'
    );
  END IF;

  IF EXISTS (SELECT 1 FROM documents WHERE title = '퍼포먼스 마케팅 최적화 보고서2') THEN
    UPDATE documents
    SET content = '6월 퍼포먼스 마케팅 최적화 후속 실험과 개선 결과를 정리한 보고서입니다.',
        summary = '6월 퍼포먼스 마케팅 최적화 보고서',
        group_id = performance_optimization_id,
        x = 5350,
        y = 1260,
        created_at = '2026-06-15 09:00:00+00',
        updated_at = '2026-06-15 09:00:00+00'
    WHERE title = '퍼포먼스 마케팅 최적화 보고서2';
  ELSE
    INSERT INTO documents (title, content, summary, group_id, x, y, created_at, updated_at)
    VALUES (
      '퍼포먼스 마케팅 최적화 보고서2',
      '6월 퍼포먼스 마케팅 최적화 후속 실험과 개선 결과를 정리한 보고서입니다.',
      '6월 퍼포먼스 마케팅 최적화 보고서',
      performance_optimization_id, 5350, 1260, '2026-06-15 09:00:00+00', '2026-06-15 09:00:00+00'
    );
  END IF;

  IF EXISTS (SELECT 1 FROM documents WHERE title = '영업 파이프라인 관리1 보고서') THEN
    UPDATE documents
    SET content = '5월 영업 파이프라인 관리 현황과 후속 액션을 정리한 보고서입니다.',
        summary = '5월 영업 파이프라인 관리 보고서',
        group_id = sales_pipeline_id,
        x = 4550,
        y = 1640,
        created_at = '2026-05-15 09:00:00+00',
        updated_at = '2026-05-15 09:00:00+00'
    WHERE title = '영업 파이프라인 관리1 보고서';
  ELSE
    INSERT INTO documents (title, content, summary, group_id, x, y, created_at, updated_at)
    VALUES (
      '영업 파이프라인 관리1 보고서',
      '5월 영업 파이프라인 관리 현황과 후속 액션을 정리한 보고서입니다.',
      '5월 영업 파이프라인 관리 보고서',
      sales_pipeline_id, 4550, 1640, '2026-05-15 09:00:00+00', '2026-05-15 09:00:00+00'
    );
  END IF;

  IF EXISTS (SELECT 1 FROM documents WHERE title = '브랜드 인지도 확산 보고서1') THEN
    UPDATE documents
    SET content = '6월 브랜드 인지도 확산 활동과 채널별 성과를 정리한 보고서입니다.',
        summary = '6월 브랜드 인지도 확산 보고서',
        group_id = brand_awareness_id,
        x = 5350,
        y = 2020,
        created_at = '2026-06-15 09:00:00+00',
        updated_at = '2026-06-15 09:00:00+00'
    WHERE title = '브랜드 인지도 확산 보고서1';
  ELSE
    INSERT INTO documents (title, content, summary, group_id, x, y, created_at, updated_at)
    VALUES (
      '브랜드 인지도 확산 보고서1',
      '6월 브랜드 인지도 확산 활동과 채널별 성과를 정리한 보고서입니다.',
      '6월 브랜드 인지도 확산 보고서',
      brand_awareness_id, 5350, 2020, '2026-06-15 09:00:00+00', '2026-06-15 09:00:00+00'
    );
  END IF;

  IF EXISTS (SELECT 1 FROM documents WHERE title = '브랜드 인지도 확산 보고서 2') THEN
    UPDATE documents
    SET content = '7월 브랜드 인지도 확산 후속 캠페인과 누적 성과를 정리한 보고서입니다.',
        summary = '7월 브랜드 인지도 확산 보고서',
        group_id = brand_awareness_id,
        x = 6150,
        y = 2020,
        created_at = '2026-07-15 09:00:00+00',
        updated_at = '2026-07-15 09:00:00+00'
    WHERE title = '브랜드 인지도 확산 보고서 2';
  ELSE
    INSERT INTO documents (title, content, summary, group_id, x, y, created_at, updated_at)
    VALUES (
      '브랜드 인지도 확산 보고서 2',
      '7월 브랜드 인지도 확산 후속 캠페인과 누적 성과를 정리한 보고서입니다.',
      '7월 브랜드 인지도 확산 보고서',
      brand_awareness_id, 6150, 2020, '2026-07-15 09:00:00+00', '2026-07-15 09:00:00+00'
    );
  END IF;
END $$;
